import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod";
import { expectedPaidCents, pointsEarnedForTotal } from "@/lib/shop/orders";
import { dbAdmin } from "@/server/db/admin";
import { adminAuditLog, checkoutSessions, orderItems, orders, products } from "@/server/db/schema";
import { newAccessToken } from "./order-token";
import { readSessionFacts, type SessionShippingAddress } from "./order-session";

// Transizioni degli ordini (passo 7.3). Ogni funzione lavora dentro una transazione dbAdmin che le passa
// `tx`: il webhook, le azioni admin e il cron le chiamano allo stesso modo. Le funzioni non inviano email:
// restituiscono gli effetti (OrderEffect) che il chiamante esegue dopo il commit (order-effects.admin.ts).
// Quando l'azione viene da un admin, si scrive una riga di admin_audit_log con il suo id (actorId).

export type AdminTx = Parameters<Parameters<typeof dbAdmin.transaction>[0]>[0];
export type OrderRow = typeof orders.$inferSelect;

// Dopo il commit: email al cliente (conferma o spedizione), inoltro al fornitore. Il token è quello in
// chiaro del link ospite, se l'ordine è di un ospite; per gli account è null.
export type OrderEffect =
  | { kind: "paid"; orderId: string; accessToken: string | null }
  | { kind: "shipped"; orderId: string; accessToken: string | null };

export type WebhookOrderResult = {
  outcome:
    | "order_created"
    | "needs_review"
    | "order_existing"
    | "order_paid"
    | "order_cancelled"
    | "checkout_failed"
    | "checkout_unknown"
    | "ignored";
  effects: OrderEffect[];
};

export type TransitionResult<T extends object = object> =
  | ({ ok: true; effects: OrderEffect[] } & T)
  | { ok: false; code: "not_found" | "invalid_state" | "needs_review" };

// Snapshot del carrello salvato in checkout_sessions.cart (scritto da checkout.ts, stessa forma).
const cartSnapshotSchema = z.array(
  z.object({
    productId: z.uuid(),
    quantity: z.number().int().min(1).max(10),
    unitPriceCents: z.number().int().min(0),
    vatRate: z.union([z.literal(4), z.literal(10), z.literal(22)]),
    title: z.string().min(1).max(200),
  }),
);

const PLACEHOLDER_EMAIL = "senza-email@invalid.local";

function shippingAddressJson(address: SessionShippingAddress | null): Record<string, string | null> | null {
  if (!address) return null;
  return {
    name: address.name,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    postalCode: address.postalCode,
    city: address.city,
    province: address.province,
    country: address.country,
  };
}

async function audit(
  tx: AdminTx,
  actorId: string | null,
  action: string,
  orderId: string,
  diff: Record<string, unknown>,
): Promise<void> {
  // Le azioni del sistema (webhook, cron) non hanno un admin e non entrano nel registro admin.
  if (!actorId) return;
  await tx.insert(adminAuditLog).values({ actorId, action, entity: "order", entityId: orderId, diff });
}

// Ruota il token del link ospite: il nuovo token va nell'email che parte, quello vecchio non vale più.
// Per gli account non c'è token (null).
async function rotateGuestToken(tx: AdminTx, order: Pick<OrderRow, "id" | "userId">): Promise<string | null> {
  if (order.userId) return null;
  const { token, hash } = newAccessToken();
  await tx.update(orders).set({ accessTokenHash: hash }).where(eq(orders.id, order.id));
  return token;
}

async function refundRedeemedPoints(tx: AdminTx, order: OrderRow): Promise<void> {
  if (!order.userId || order.pointsRedeemed <= 0 || !order.checkoutSessionId) return;
  // Una volta sola per checkout: award_points ha il vincolo unico (utente, motivo, riferimento).
  await tx.execute(
    sql`select public.award_points(${order.userId}::uuid, ${order.pointsRedeemed}::integer, 'redeem_refund', 'checkout', ${order.checkoutSessionId}::uuid)`,
  );
}

async function lockOrderById(tx: AdminTx, orderId: string): Promise<OrderRow | null> {
  const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  return row ?? null;
}

// checkout.session.completed: crea l'ordine dallo snapshot del checkout e dai dati di Stripe. Il totale
// della sessione deve coincidere con subtotale − sconto + spedizione del checkout: se non coincide, o se
// mancano dati, l'ordine va in needs_review e nessuna email né inoltro parte. Lo stesso evento due volte,
// o due eventi per la stessa sessione, non creano due ordini (stripe_session_id è unico).
export async function recordCompletedSession(tx: AdminTx, session: Stripe.Checkout.Session): Promise<WebhookOrderResult> {
  const facts = readSessionFacts(session);
  if (!facts.checkoutId) {
    console.error("order_checkout_id_missing", { sessionId: facts.sessionId });
    return { outcome: "checkout_unknown", effects: [] };
  }

  const [existing] = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.stripeSessionId, facts.sessionId))
    .limit(1);
  if (existing) return { outcome: "order_existing", effects: [] };

  const [checkout] = await tx
    .select()
    .from(checkoutSessions)
    .where(eq(checkoutSessions.id, facts.checkoutId))
    .for("update");
  if (!checkout) {
    console.error("order_checkout_not_found", { checkoutId: facts.checkoutId });
    return { outcome: "checkout_unknown", effects: [] };
  }

  const cart = cartSnapshotSchema.parse(checkout.cart);
  const productRows = await tx
    .select({
      id: products.id,
      producerId: products.producerId,
      supplierId: products.supplierId,
      supplierSku: products.supplierSku,
      costCents: products.costCents,
    })
    .from(products)
    .where(inArray(products.id, cart.map((line) => line.productId)));
  const productById = new Map(productRows.map((row) => [row.id, row]));
  for (const line of cart) {
    if (!productById.has(line.productId)) throw new Error("order_product_missing");
  }

  const totalCents = expectedPaidCents({
    subtotalCents: checkout.subtotalCents,
    discountCents: checkout.discountCents,
    shippingCents: checkout.shippingCents,
  });

  const reasons: string[] = [];
  if (checkout.status !== "open" && checkout.status !== "completed") reasons.push("checkout_closed");
  if (facts.amountTotalCents !== totalCents) reasons.push("amount_mismatch");
  if (facts.currency !== "eur") reasons.push("currency");
  if (!facts.email) reasons.push("no_email");
  if (!facts.shippingAddress || facts.shippingAddress.country !== "IT") reasons.push("shipping_address");

  const paid = facts.paymentStatus === "paid";
  const guestToken = checkout.userId ? null : newAccessToken();

  const [created] = await tx
    .insert(orders)
    .values({
      userId: checkout.userId,
      email: facts.email ?? PLACEHOLDER_EMAIL,
      locale: facts.locale,
      status: paid ? "paid" : "pending",
      needsReview: reasons.length > 0,
      subtotalCents: checkout.subtotalCents,
      discountCents: checkout.discountCents,
      shippingCents: checkout.shippingCents,
      totalCents,
      pointsRedeemed: checkout.pointsRedeemed,
      paidAmountCents: facts.amountTotalCents,
      stripeSessionId: facts.sessionId,
      paymentIntentId: facts.paymentIntentId,
      checkoutSessionId: checkout.id,
      accessTokenHash: guestToken?.hash ?? null,
      shippingAddress: shippingAddressJson(facts.shippingAddress),
    })
    .returning({ id: orders.id, orderNumber: orders.orderNumber });
  if (!created) throw new Error("order_insert_no_row");

  await tx.insert(orderItems).values(
    cart.map((line) => {
      const product = productById.get(line.productId);
      if (!product) throw new Error("order_product_missing");
      return {
        orderId: created.id,
        productId: line.productId,
        producerId: product.producerId,
        supplierId: product.supplierId,
        supplierSku: product.supplierSku,
        titleSnapshot: line.title,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        vatRate: line.vatRate,
        costCentsSnapshot: product.costCents,
      };
    }),
  );

  if (checkout.status === "open") {
    await tx.update(checkoutSessions).set({ status: "completed" }).where(eq(checkoutSessions.id, checkout.id));
  }

  if (reasons.length > 0) {
    // Solo codici: nessun importo né indirizzo nei log.
    console.error("order_needs_review", { orderNumber: created.orderNumber, reasons });
  }

  const effects: OrderEffect[] = [];
  if (paid && reasons.length === 0) {
    effects.push({ kind: "paid", orderId: created.id, accessToken: guestToken?.token ?? null });
  }
  return { outcome: reasons.length > 0 ? "needs_review" : "order_created", effects };
}

// checkout.session.async_payment_succeeded: il pagamento asincrono è arrivato. L'ordine passa a pagato.
export async function recordAsyncPaymentSucceeded(tx: AdminTx, session: Stripe.Checkout.Session): Promise<WebhookOrderResult> {
  const facts = readSessionFacts(session);
  const [order] = await tx.select().from(orders).where(eq(orders.stripeSessionId, facts.sessionId)).for("update");
  if (!order) return { outcome: "ignored", effects: [] };
  if (order.status !== "pending") return { outcome: "order_existing", effects: [] };

  const token = await rotateGuestToken(tx, order);
  await tx.update(orders).set({ status: "paid" }).where(eq(orders.id, order.id));
  const effects: OrderEffect[] = order.needsReview ? [] : [{ kind: "paid", orderId: order.id, accessToken: token }];
  return { outcome: "order_paid", effects };
}

// checkout.session.async_payment_failed: il pagamento asincrono è fallito. L'ordine non pagato si annulla
// e i punti tornano. Senza ordine, si chiude la riga del checkout (checkout_fail_from_stripe).
export async function recordAsyncPaymentFailed(tx: AdminTx, session: Stripe.Checkout.Session): Promise<WebhookOrderResult> {
  const facts = readSessionFacts(session);
  const [order] = await tx.select().from(orders).where(eq(orders.stripeSessionId, facts.sessionId)).for("update");
  if (order) {
    if (order.status !== "pending") return { outcome: "ignored", effects: [] };
    await tx.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));
    await refundRedeemedPoints(tx, order);
    return { outcome: "order_cancelled", effects: [] };
  }
  if (!facts.checkoutId) return { outcome: "ignored", effects: [] };
  const rows = await tx.execute<{ closed: boolean }>(
    sql`select public.checkout_fail_from_stripe(${facts.checkoutId}::uuid, ${facts.sessionId}::text) as closed`,
  );
  return { outcome: rows[0]?.closed === true ? "checkout_failed" : "ignored", effects: [] };
}

// Admin conferma l'inoltro a mano (portale del fornitore, telefono). Richiede un ordine pagato e senza
// revisione in corso. Anche dopo un problema si può inoltrare di nuovo.
export async function markForwardedTx(
  tx: AdminTx,
  input: { orderId: string; actorId: string; now: Date },
): Promise<TransitionResult> {
  const order = await lockOrderById(tx, input.orderId);
  if (!order) return { ok: false, code: "not_found" };
  if (order.needsReview) return { ok: false, code: "needs_review" };
  if (order.status !== "paid" || (order.supplierStatus !== "pending" && order.supplierStatus !== "problem")) {
    return { ok: false, code: "invalid_state" };
  }
  await tx
    .update(orders)
    .set({ supplierStatus: "forwarded", forwardedAt: input.now })
    .where(eq(orders.id, order.id));
  await audit(tx, input.actorId, "order.forwarded", order.id, { from: order.supplierStatus, to: "forwarded" });
  return { ok: true, effects: [] };
}

// Il fornitore ha confermato l'ordine.
export async function markSupplierConfirmedTx(
  tx: AdminTx,
  input: { orderId: string; actorId: string },
): Promise<TransitionResult> {
  const order = await lockOrderById(tx, input.orderId);
  if (!order) return { ok: false, code: "not_found" };
  if (order.supplierStatus !== "forwarded") return { ok: false, code: "invalid_state" };
  await tx.update(orders).set({ supplierStatus: "confirmed" }).where(eq(orders.id, order.id));
  await audit(tx, input.actorId, "order.supplier_confirmed", order.id, { from: "forwarded", to: "confirmed" });
  return { ok: true, effects: [] };
}

// Spedizione: corriere e tracking, stato shipped, email al cliente con il link di tracciamento.
export async function shipOrderTx(
  tx: AdminTx,
  input: {
    orderId: string;
    actorId: string;
    carrier: string;
    trackingNumber: string;
    trackingUrl: string | null;
    now: Date;
  },
): Promise<TransitionResult> {
  const order = await lockOrderById(tx, input.orderId);
  if (!order) return { ok: false, code: "not_found" };
  if (order.needsReview) return { ok: false, code: "needs_review" };
  if (order.status !== "paid") return { ok: false, code: "invalid_state" };

  const token = await rotateGuestToken(tx, order);
  await tx
    .update(orders)
    .set({
      status: "shipped",
      supplierStatus: "shipped",
      carrier: input.carrier,
      trackingNumber: input.trackingNumber,
      trackingUrl: input.trackingUrl,
      shippedAt: input.now,
    })
    .where(eq(orders.id, order.id));
  await audit(tx, input.actorId, "order.shipped", order.id, {
    from: order.supplierStatus,
    to: "shipped",
    carrier: input.carrier,
  });
  return { ok: true, effects: [{ kind: "shipped", orderId: order.id, accessToken: token }] };
}

// Consegna: stato delivered e, per un account, i punti (1 per euro del totale pagato) una sola volta.
// Chiamata dall'admin (con actorId) o dal cron di consegna automatica (actorId null, nessuna riga di audit).
export async function deliverOrderTx(
  tx: AdminTx,
  input: { orderId: string; actorId: string | null; now: Date },
): Promise<TransitionResult<{ pointsAwarded: number }>> {
  const order = await lockOrderById(tx, input.orderId);
  if (!order) return { ok: false, code: "not_found" };
  if (order.status !== "shipped") return { ok: false, code: "invalid_state" };

  await tx
    .update(orders)
    .set({ status: "delivered", supplierStatus: "delivered", deliveredAt: input.now })
    .where(eq(orders.id, order.id));

  let pointsAwarded = 0;
  const points = pointsEarnedForTotal(order.totalCents);
  if (order.userId && points > 0) {
    const rows = await tx.execute<{ awarded: boolean }>(
      sql`select public.award_points(${order.userId}::uuid, ${points}::integer, 'order', 'order', ${order.id}::uuid) as awarded`,
    );
    pointsAwarded = rows[0]?.awarded === true ? points : 0;
  }

  await audit(tx, input.actorId, "order.delivered", order.id, { from: "shipped", to: "delivered", pointsAwarded });
  return { ok: true, effects: [], pointsAwarded };
}

// Problema con l'ordine: una nota obbligatoria, stato del fornitore "problem". Lo stato del cliente non cambia.
export async function markProblemTx(
  tx: AdminTx,
  input: { orderId: string; actorId: string; note: string },
): Promise<TransitionResult> {
  const order = await lockOrderById(tx, input.orderId);
  if (!order) return { ok: false, code: "not_found" };
  if (order.status !== "paid" && order.status !== "shipped") return { ok: false, code: "invalid_state" };
  await tx
    .update(orders)
    .set({ supplierStatus: "problem", problemNote: input.note })
    .where(eq(orders.id, order.id));
  await audit(tx, input.actorId, "order.problem", order.id, { from: order.supplierStatus, to: "problem" });
  return { ok: true, effects: [] };
}

// Revisione conclusa: l'importo era corretto (o è stato verificato). L'ordine pagato riceve ora la
// conferma al cliente; l'inoltro al fornitore lo fa il chiamante con l'effetto "paid".
export async function clearReviewTx(
  tx: AdminTx,
  input: { orderId: string; actorId: string },
): Promise<TransitionResult> {
  const order = await lockOrderById(tx, input.orderId);
  if (!order) return { ok: false, code: "not_found" };
  if (!order.needsReview) return { ok: false, code: "invalid_state" };

  await tx.update(orders).set({ needsReview: false }).where(eq(orders.id, order.id));
  await audit(tx, input.actorId, "order.review_cleared", order.id, { status: order.status });

  if (order.status !== "paid") return { ok: true, effects: [] };
  const token = await rotateGuestToken(tx, order);
  return { ok: true, effects: [{ kind: "paid", orderId: order.id, accessToken: token }] };
}
