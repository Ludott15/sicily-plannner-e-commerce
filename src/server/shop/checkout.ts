import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Locale } from "@/lib/i18n/routing";
import { POINTS_PER_EURO, MAX_POINTS_DISCOUNT_PERCENT } from "@/lib/shop/config";
import { CHECKOUT_EXPIRY_SECONDS, cartTotals, pointsDiscount } from "@/lib/shop/checkout-math";
import { dbPublic } from "@/server/db/public";
import { pointsLedger } from "@/server/db/schema";
import { dbAsUser, type DbUser, type UserTx } from "@/server/db/user";
import type { CartLine } from "./cart";
import { dbErrorCode } from "./action-utils";
import type { CheckoutGateway } from "./checkout-gateway";

// Checkout (passo 7.2). Ordine delle operazioni, scelto per non dare mai sconto senza punti scalati
// né punti scalati senza sessione:
//   1. transazione nel database (checkout_create): riga aperta con lo snapshot e, se richiesti, punti
//      scalati nella stessa transazione. Il tetto e il saldo li controlla la funzione SQL sotto lock;
//   2. coupon monouso su Stripe (solo con sconto), poi sessione di pagamento con metadati checkout_id;
//   3. collegamento dell'id di sessione alla riga.
// Se 2 fallisce, la riga si chiude e i punti tornano (checkout_release). Se 3 fallisce, la sessione
// resta valida ma senza id: alla sua scadenza il webhook chiude la riga per checkout_id (metadati) e
// restituisce i punti. Un crash tra 1 e 2 lascia la riga aperta senza sessione: il punto è in docs/LANCIO.md.
// Il token monouso (32 byte casuali) lo genera il server per ogni checkout: nel database entra solo il
// suo SHA-256, e attach e release lo richiedono. Non è derivato da CART_SECRET né dall'uuid.

export type CheckoutErrorCode = "empty" | "stock_changed" | "payments_unavailable" | "failed";

export type CheckoutOutcome =
  | { status: "ok"; url: string; checkoutId: string; discountCents: number; pointsRedeemed: number }
  | { status: "error"; code: CheckoutErrorCode };

export type RunCheckoutInput = {
  // Sessione corrente (anche ospite) o null: senza sessione non ci sono punti.
  user: DbUser | null;
  // Email dell'account (non ospite): precompila il modulo di Stripe.
  customerEmail: string | null;
  lines: readonly CartLine[];
  // Righe del cookie scartate da readCart: il carrello è cambiato, il cliente deve rivederlo.
  droppedLines: number;
  usePoints: boolean;
  locale: Locale;
  siteUrl: string;
  gateway: CheckoutGateway;
  now?: Date;
};

type CheckoutCreateRow = { discount_cents: number; points_redeemed: number };

export async function runCheckout(input: RunCheckoutInput): Promise<CheckoutOutcome> {
  if (input.lines.length === 0) return { status: "error", code: "empty" };
  if (input.droppedLines > 0) return { status: "error", code: "stock_changed" };

  const totals = cartTotals(input.lines);
  const checkoutId = randomUUID();
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + CHECKOUT_EXPIRY_SECONDS * 1000);
  const snapshot = input.lines.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    vatRate: line.vatRate,
    title: line.title,
  }));

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");

  let created: CheckoutCreateRow;
  try {
    created = await createCheckoutRow({
      user: input.user,
      checkoutId,
      tokenHash,
      snapshot,
      subtotalCents: totals.subtotalCents,
      shippingCents: totals.shippingCents,
      usePoints: input.usePoints,
      expiresAt,
    });
  } catch (error) {
    logFailure("checkout_create", error);
    return { status: "error", code: "failed" };
  }

  let session: { id: string; url: string };
  try {
    const couponId =
      created.discount_cents > 0
        ? await input.gateway.createCoupon({ checkoutId, amountOffCents: created.discount_cents })
        : null;
    session = await input.gateway.createSession({
      checkoutId,
      locale: input.locale,
      lines: input.lines.map((line) => ({
        productId: line.productId,
        title: line.title,
        unitPriceCents: line.unitPriceCents,
        quantity: line.quantity,
      })),
      shippingCents: totals.shippingCents,
      couponId,
      customerEmail: input.customerEmail,
      siteUrl: input.siteUrl,
      expiresAtSeconds: Math.floor(expiresAt.getTime() / 1000),
    });
  } catch (error) {
    logFailure("stripe_session", error);
    await releaseCheckout(checkoutId, token);
    return { status: "error", code: "failed" };
  }

  try {
    const attached = await attachSession(checkoutId, token, session.id);
    if (!attached) throw new Error("checkout_attach_rejected");
  } catch (error) {
    // Sessione creata ma non collegata: la scadenza la chiude e restituisce i punti (webhook).
    logFailure("checkout_attach", error);
    return { status: "error", code: "failed" };
  }

  return {
    status: "ok",
    url: session.url,
    checkoutId,
    discountCents: created.discount_cents,
    pointsRedeemed: created.points_redeemed,
  };
}

async function createCheckoutRow(input: {
  user: DbUser | null;
  checkoutId: string;
  tokenHash: string;
  snapshot: readonly object[];
  subtotalCents: number;
  shippingCents: number;
  usePoints: boolean;
  expiresAt: Date;
}): Promise<CheckoutCreateRow> {
  const cart = JSON.stringify(input.snapshot);
  const run = (tx: UserTx) =>
    tx.execute<CheckoutCreateRow>(sql`
      select discount_cents, points_redeemed
      from public.checkout_create(
        ${input.checkoutId}::uuid,
        ${cart}::jsonb,
        ${input.subtotalCents}::integer,
        ${input.shippingCents}::integer,
        ${input.usePoints}::boolean,
        ${POINTS_PER_EURO}::integer,
        ${MAX_POINTS_DISCOUNT_PERCENT}::integer,
        ${input.expiresAt.toISOString()}::timestamptz,
        ${input.tokenHash}::text
      )`);
  const rows = input.user ? await dbAsUser(input.user, run) : await dbPublic(run);
  const row = rows[0];
  if (!row) throw new Error("checkout_create_no_row");
  return row;
}

async function attachSession(checkoutId: string, token: string, stripeSessionId: string): Promise<boolean> {
  const rows = await dbPublic((tx) =>
    tx.execute<{ ok: boolean }>(
      sql`select public.checkout_attach_stripe_session(${checkoutId}::uuid, ${token}::text, ${stripeSessionId}::text) as ok`,
    ),
  );
  return rows[0]?.ok === true;
}

// Chiude una riga senza sessione Stripe e restituisce i punti. Un errore qui non nasconde l'errore
// del checkout: si registra e basta (la riga resta aperta fino a una verifica manuale).
async function releaseCheckout(checkoutId: string, token: string): Promise<void> {
  try {
    await dbPublic((tx) => tx.execute(sql`select public.checkout_release(${checkoutId}::uuid, ${token}::text)`));
  } catch (error) {
    logFailure("checkout_release", error);
  }
}

// Saldo punti e sconto possibile per il subtotale dato. Solo account (non ospiti): gli altri hanno zero.
export type PointsOffer = { balancePoints: number; points: number; discountCents: number };

export async function readPointsOffer(user: DbUser | null, subtotalCents: number): Promise<PointsOffer> {
  if (!user || user.is_anonymous) return { balancePoints: 0, points: 0, discountCents: 0 };
  const rows = await dbAsUser(user, (tx) =>
    tx
      .select({ balance: sql<number>`coalesce(sum(${pointsLedger.delta}), 0)::int` })
      .from(pointsLedger)
      .where(eq(pointsLedger.userId, user.id)),
  );
  const balancePoints = Number(rows[0]?.balance ?? 0);
  return { balancePoints, ...pointsDiscount({ balancePoints, subtotalCents }) };
}

function logFailure(step: string, error: unknown): void {
  // Solo il codice: il messaggio può contenere valori inseriti e non esce nei log.
  console.error("checkout_failed", { step, code: dbErrorCode(error).sqlstate });
}
