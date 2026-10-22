import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as cronGet } from "@/app/api/cron/shop/route";
import { POST as testCompletePost } from "@/app/api/stripe/test-complete/route";
import { POST as webhookPost } from "@/app/api/stripe/webhook/route";
import { GET as csvGet } from "@/app/[locale]/(admin)/admin/ordini/esporta/route";
import { expectedPaidCents, isOrderNumber } from "@/lib/shop/orders";
import { dbAdmin } from "@/server/db/admin";
import {
  adminAuditLog,
  checkoutSessions,
  orderItems,
  orders,
  products,
  producers,
  stripeEvents,
  suppliers,
} from "@/server/db/schema";
import type { EmailSendResult } from "@/server/email/send";
import { fakeSessionId } from "./checkout-gateway";
import { getGuestOrder, getMyOrder, listMyOrders, orderForCheckoutSession } from "./orders";
import { exportOrdersCsv, listOrdersAdmin } from "./orders.admin";
import { markOrderDeliveredAction, reportOrderProblemAction, shipOrderAction } from "./orders-actions.admin";
import { runOrdersCron } from "./orders-cron.admin";
import { runOrderEffects } from "./order-effects.admin";
import {
  clearReviewTx,
  deliverOrderTx,
  markForwardedTx,
  markProblemTx,
  recordAsyncPaymentSucceeded,
  recordCompletedSession,
  resendOrderLinkTx,
  shipOrderTx,
  type AdminTx,
} from "./orders-state.admin";
import { hashAccessToken } from "./order-token";
import { handleStripeEvent } from "./stripe-webhook.admin";

// Ordini (passo 7.3) con il database reale: webhook completed/async/failed con idempotenza e prova a rovescio
// dell'importo, valuta e paese, ospite con token, transizioni admin con audit e punti una volta, cron con le
// regole e l'avviso admin, export CSV con riconciliazione, route e azioni. Le email sono simulate: si
// registrano le chiamate e si decide l'esito dell'invio. Dati con prefisso int- e pulizia a fine suite.

const mocks = vi.hoisted(() => ({
  emailResult: "unavailable" as "sent" | "unavailable" | "failed",
  emailCalls: [] as { to: string; subject: string }[],
  auth: { userId: null as string | null, role: "admin" as "admin" | "user" },
}));

vi.mock("@/server/email/send", () => ({
  sendEmail: async (message: { to: string; subject: string }): Promise<EmailSendResult> => {
    mocks.emailCalls.push({ to: message.to, subject: message.subject });
    return { status: mocks.emailResult };
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => (key: string) => `${namespace}.${key}`,
}));

vi.mock("@/server/auth", () => ({
  requireAdmin: async () => ({ user: { id: adminId }, profile: { id: adminId, role: "admin" } }),
  getUser: async () => (mocks.auth.userId ? { id: mocks.auth.userId } : null),
  getProfile: async () => ({ id: adminId, role: mocks.auth.role }),
}));

const tag = `o${Date.now()}`;
const WEBHOOK_SECRET = "whsec_int_orders_test";
const adminId = randomUUID();
const accountId = randomUUID();
const otherAccountId = randomUUID();
const supplierId = randomUUID();
const producerId = randomUUID();
const productId = randomUUID();
const accountEmail = `int-orders-${tag}@example.com`;
const createdCheckoutIds: string[] = [];
const createdOrderIds: string[] = [];
const createdEventIds: string[] = [];
let previousWebhookSecret: string | undefined;

type CartSnapshot = { productId: string; quantity: number; unitPriceCents: number; vatRate: number; title: string };

const lineQuantity = 2;
const unitPrice = 1500;
const cart: CartSnapshot[] = [
  { productId, quantity: lineQuantity, unitPriceCents: unitPrice, vatRate: 10, title: "int- crema di prova" },
];
const SUBTOTAL = lineQuantity * unitPrice; // 3000
const SHIPPING = 690;

async function createCheckout(opts: {
  userId: string | null;
  discountCents?: number;
  pointsRedeemed?: number;
  shippingCents?: number;
  status?: "open" | "expired";
}): Promise<{ checkoutId: string; sessionId: string }> {
  const checkoutId = randomUUID();
  const sessionId = `cs_test_int_${checkoutId.replace(/-/g, "")}`;
  await dbAdmin.insert(checkoutSessions).values({
    id: checkoutId,
    stripeSessionId: sessionId,
    userId: opts.userId,
    cart,
    subtotalCents: SUBTOTAL,
    shippingCents: opts.shippingCents ?? SHIPPING,
    discountCents: opts.discountCents ?? 0,
    pointsRedeemed: opts.pointsRedeemed ?? 0,
    tokenHash: hashAccessToken(randomUUID()),
    status: opts.status ?? "open",
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  createdCheckoutIds.push(checkoutId);
  return { checkoutId, sessionId };
}

function sessionObject(opts: {
  sessionId: string;
  checkoutId: string;
  amountTotal: number;
  paymentStatus?: "paid" | "unpaid";
  email?: string;
  currency?: string;
  country?: string;
}): Record<string, unknown> {
  return {
    id: opts.sessionId,
    object: "checkout.session",
    metadata: { checkout_id: opts.checkoutId },
    payment_status: opts.paymentStatus ?? "paid",
    payment_intent: `pi_test_${opts.sessionId.slice(-12)}`,
    amount_total: opts.amountTotal,
    currency: opts.currency ?? "eur",
    locale: "it",
    customer_details: { email: opts.email ?? accountEmail, name: "Maria Prova", phone: "+390000000000" },
    collected_information: {
      shipping_details: {
        name: "Maria Prova",
        address: {
          line1: "Via di prova 1",
          line2: null,
          city: "Palermo",
          state: "PA",
          postal_code: "90100",
          country: opts.country ?? "IT",
        },
      },
    },
  };
}

function completedEvent(eventId: string, session: Record<string, unknown>, type = "checkout.session.completed"): Stripe.Event {
  return { id: eventId, object: "event", livemode: false, type, data: { object: session } } as unknown as Stripe.Event;
}

function expectedTotal(discountCents: number, shippingCents = SHIPPING): number {
  return expectedPaidCents({ subtotalCents: SUBTOTAL, discountCents, shippingCents });
}

async function orderBySession(sessionId: string) {
  const [row] = await dbAdmin.select().from(orders).where(eq(orders.stripeSessionId, sessionId)).limit(1);
  if (row) createdOrderIds.push(row.id);
  return row ?? null;
}

async function pointsLedgerRows(userId: string, reason: string, refId: string): Promise<number> {
  const [row] = await dbAdmin.execute<{ n: number }>(
    sql`select count(*)::int as n from public.points_ledger where user_id = ${userId} and reason = ${reason}::public.point_reason and ref_id = ${refId}::uuid`,
  );
  return Number(row?.n ?? 0);
}

async function balanceOf(userId: string): Promise<number> {
  const [row] = await dbAdmin.execute<{ n: number }>(
    sql`select coalesce(sum(delta), 0)::int as n from public.points_ledger where user_id = ${userId}`,
  );
  return Number(row?.n ?? 0);
}

async function tx<T>(work: (transaction: AdminTx) => Promise<T>): Promise<T> {
  return dbAdmin.transaction(work);
}

beforeAll(async () => {
  previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

  await dbAdmin.execute(sql`
    insert into auth.users (id, email, raw_user_meta_data) values
      (${accountId}, ${accountEmail}, '{"full_name":"int-orders"}'),
      (${otherAccountId}, ${`int-orders-altro-${tag}@example.com`}, '{"full_name":"int-orders altro"}'),
      (${adminId}, ${`int-orders-admin-${tag}@example.com`}, '{"full_name":"int-orders admin"}')`);
  await dbAdmin.execute(sql`update public.profiles set role = 'admin' where id = ${adminId}`);

  await dbAdmin.insert(suppliers).values({
    id: supplierId,
    name: `int- fornitore ${tag}`,
    kind: "manual",
    contactEmail: `fornitore-${tag}@example.com`,
    isActive: true,
  });
  await dbAdmin.insert(producers).values({
    id: producerId,
    slug: `int-produttore-${tag}`,
    name: "int- produttore",
    isPublic: true,
    isActive: true,
  });
  await dbAdmin.insert(products).values({
    id: productId,
    slug: `int-prodotto-${tag}`,
    producerId,
    supplierId,
    supplierSku: `int-sku-${tag}`,
    title: "int- crema di prova",
    category: "dolci",
    priceCents: unitPrice,
    costCents: 600,
    vatRate: 10,
    leadTimeDays: 3,
    allergensDeclared: true,
    isActive: false,
  });
});

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    await dbAdmin.delete(orders).where(inArray(orders.id, createdOrderIds));
  }
  // Ogni ordine che usa il prodotto di prova (anche quelli creati dalle route) va via prima del prodotto.
  await dbAdmin.execute(
    sql`delete from public.orders where id in (select order_id from public.order_items where product_id = ${productId}::uuid)`,
  );
  if (createdCheckoutIds.length > 0) {
    await dbAdmin.delete(checkoutSessions).where(inArray(checkoutSessions.id, createdCheckoutIds));
  }
  if (createdEventIds.length > 0) {
    await dbAdmin.delete(stripeEvents).where(inArray(stripeEvents.id, createdEventIds));
  }
  await dbAdmin.delete(products).where(eq(products.id, productId));
  await dbAdmin.delete(producers).where(eq(producers.id, producerId));
  await dbAdmin.delete(suppliers).where(eq(suppliers.id, supplierId));
  if (previousWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;
});

describe("webhook checkout.session.completed", () => {
  it("crea un ordine pagato dallo snapshot, con le righe, il costo e il fornitore; la ripetizione non ne crea un altro", async () => {
    mocks.emailResult = "unavailable";
    const { checkoutId, sessionId } = await createCheckout({ userId: accountId });
    const eventId = `evt_int_${tag}_1`;
    createdEventIds.push(eventId);

    const outcome = await handleStripeEvent(
      completedEvent(eventId, sessionObject({ sessionId, checkoutId, amountTotal: expectedTotal(0) })),
    );
    expect(outcome).toBe("order_created");

    const order = await orderBySession(sessionId);
    expect(order).not.toBeNull();
    expect(isOrderNumber(order?.orderNumber ?? "")).toBe(true);
    expect(order?.status).toBe("paid");
    expect(order?.supplierStatus).toBe("pending");
    expect(order?.needsReview).toBe(false);
    expect(order?.totalCents).toBe(expectedTotal(0));
    expect(order?.paidAmountCents).toBe(expectedTotal(0));
    expect(order?.userId).toBe(accountId);
    expect(order?.accessTokenHash).toBeNull();
    expect(order?.shippingAddress).toMatchObject({ name: "Maria Prova", postalCode: "90100", country: "IT", phone: "+390000000000" });

    const items = await dbAdmin.select().from(orderItems).where(eq(orderItems.orderId, order?.id ?? ""));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      titleSnapshot: "int- crema di prova",
      quantity: lineQuantity,
      unitPriceCents: unitPrice,
      vatRate: 10,
      supplierId,
      costCentsSnapshot: 600,
    });

    const [checkout] = await dbAdmin.select().from(checkoutSessions).where(eq(checkoutSessions.id, checkoutId));
    expect(checkout?.status).toBe("completed");

    // Stesso evento due volte: nessun effetto la seconda volta.
    expect(
      await handleStripeEvent(completedEvent(eventId, sessionObject({ sessionId, checkoutId, amountTotal: expectedTotal(0) }))),
    ).toBe("duplicate");
    // Un altro evento per la stessa sessione: l'ordine c'è già, nessun doppione.
    expect(
      await handleStripeEvent(
        completedEvent(`evt_int_${tag}_1b`, sessionObject({ sessionId, checkoutId, amountTotal: expectedTotal(0) })),
      ),
    ).toBe("order_existing");
    createdEventIds.push(`evt_int_${tag}_1b`);
    const count = await dbAdmin.select({ id: orders.id }).from(orders).where(eq(orders.stripeSessionId, sessionId));
    expect(count).toHaveLength(1);
  });

  it("prova a rovescio: importo manomesso in Stripe → needs_review, nessun inoltro, totale dallo snapshot", async () => {
    mocks.emailResult = "sent";
    mocks.emailCalls.length = 0;
    const { checkoutId, sessionId } = await createCheckout({ userId: accountId });
    const eventId = `evt_int_${tag}_tamper`;
    createdEventIds.push(eventId);
    const tampered = expectedTotal(0) - 500; // il cliente ha pagato 5 euro in meno

    const outcome = await handleStripeEvent(
      completedEvent(eventId, sessionObject({ sessionId, checkoutId, amountTotal: tampered })),
    );
    expect(outcome).toBe("needs_review");

    const order = await orderBySession(sessionId);
    expect(order?.needsReview).toBe(true);
    expect(order?.totalCents).toBe(expectedTotal(0)); // il totale è quello dello snapshot, non quello di Stripe
    expect(order?.paidAmountCents).toBe(tampered);
    expect(order?.supplierStatus).toBe("pending");
    // Nessuna email al cliente e nessun inoltro al fornitore: la revisione li ferma entrambi.
    expect(mocks.emailCalls).toHaveLength(0);
    mocks.emailResult = "unavailable";
  });

  it("prova a rovescio: valuta USD o paese FR → needs_review, nessuna email", async () => {
    mocks.emailResult = "sent";
    mocks.emailCalls.length = 0;
    const usd = await createCheckout({ userId: accountId });
    const usdEvent = `evt_int_${tag}_usd`;
    createdEventIds.push(usdEvent);
    expect(
      await handleStripeEvent(
        completedEvent(usdEvent, sessionObject({ sessionId: usd.sessionId, checkoutId: usd.checkoutId, amountTotal: expectedTotal(0), currency: "usd" })),
      ),
    ).toBe("needs_review");
    expect((await orderBySession(usd.sessionId))?.needsReview).toBe(true);

    const fr = await createCheckout({ userId: accountId });
    const frEvent = `evt_int_${tag}_fr`;
    createdEventIds.push(frEvent);
    expect(
      await handleStripeEvent(
        completedEvent(frEvent, sessionObject({ sessionId: fr.sessionId, checkoutId: fr.checkoutId, amountTotal: expectedTotal(0), country: "FR" })),
      ),
    ).toBe("needs_review");
    expect((await orderBySession(fr.sessionId))?.needsReview).toBe(true);

    expect(mocks.emailCalls).toHaveLength(0);
    mocks.emailResult = "unavailable";
  });

  it("email mancante nell'evento → revisione, con un indirizzo di segnaposto", async () => {
    const { checkoutId, sessionId } = await createCheckout({ userId: accountId });
    const session = sessionObject({ sessionId, checkoutId, amountTotal: expectedTotal(0), email: "" });
    const outcome = await handleStripeEvent(completedEvent(`evt_int_${tag}_noemail`, session));
    createdEventIds.push(`evt_int_${tag}_noemail`);
    expect(outcome).toBe("needs_review");
    expect((await orderBySession(sessionId))?.email).toBe("senza-email@invalid.local");
  });

  it("checkout_id mancante o checkout inesistente: errore, nessun evento registrato (Stripe riprova)", async () => {
    const withoutId = sessionObject({ sessionId: `cs_test_int_noid_${tag}`, checkoutId: "", amountTotal: expectedTotal(0) });
    withoutId.metadata = {};
    const missingEventId = `evt_int_${tag}_noid`;
    await expect(handleStripeEvent(completedEvent(missingEventId, withoutId))).rejects.toThrow("order_checkout_id_missing");
    const [registered] = await dbAdmin.select({ id: stripeEvents.id }).from(stripeEvents).where(eq(stripeEvents.id, missingEventId));
    expect(registered).toBeUndefined();

    const ghostCheckout = randomUUID();
    const ghost = sessionObject({ sessionId: `cs_test_int_ghost_${tag}`, checkoutId: ghostCheckout, amountTotal: expectedTotal(0) });
    const ghostEventId = `evt_int_${tag}_ghost`;
    await expect(handleStripeEvent(completedEvent(ghostEventId, ghost))).rejects.toThrow("order_checkout_not_found");
    const [ghostRegistered] = await dbAdmin.select({ id: stripeEvents.id }).from(stripeEvents).where(eq(stripeEvents.id, ghostEventId));
    expect(ghostRegistered).toBeUndefined();
  });

  it("route del webhook: firma valida → 200, e l'ordine si crea", async () => {
    const { checkoutId, sessionId } = await createCheckout({ userId: accountId });
    const eventId = `evt_int_${tag}_route`;
    createdEventIds.push(eventId);
    const payload = JSON.stringify(
      completedEvent(eventId, sessionObject({ sessionId, checkoutId, amountTotal: expectedTotal(0) })),
    );
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const response = await webhookPost(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": header, "content-type": "application/json" },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ received: true, outcome: "order_created" });
    expect(await orderBySession(sessionId)).not.toBeNull();
  });
});

describe("pagamento asincrono", () => {
  it("unpaid → in attesa; async_payment_succeeded → pagato, una volta sola", async () => {
    const { checkoutId, sessionId } = await createCheckout({ userId: accountId });
    const completed = await tx((transaction) =>
      recordCompletedSession(transaction, sessionObject({ sessionId, checkoutId, amountTotal: expectedTotal(0), paymentStatus: "unpaid" }) as unknown as Stripe.Checkout.Session),
    );
    expect(completed.outcome).toBe("order_created");
    expect((await orderBySession(sessionId))?.status).toBe("pending");
    expect(completed.effects).toHaveLength(0);

    const succeeded = await handleStripeEvent(
      completedEvent(`evt_int_${tag}_async_ok`, sessionObject({ sessionId, checkoutId, amountTotal: expectedTotal(0) }), "checkout.session.async_payment_succeeded"),
    );
    createdEventIds.push(`evt_int_${tag}_async_ok`);
    expect(succeeded).toBe("order_paid");
    expect((await orderBySession(sessionId))?.status).toBe("paid");

    const again = await tx((transaction) =>
      recordAsyncPaymentSucceeded(transaction, sessionObject({ sessionId, checkoutId, amountTotal: expectedTotal(0) }) as unknown as Stripe.Checkout.Session),
    );
    expect(again.outcome).toBe("order_existing");
  });

  it("async_payment_failed su un ordine in attesa: annullato e punti restituiti una volta sola", async () => {
    const before = await balanceOf(accountId);
    const { checkoutId, sessionId } = await createCheckout({ userId: accountId, discountCents: 300, pointsRedeemed: 300 });
    // Punti scalati come fa checkout_create: il saldo scende di 300.
    await dbAdmin.execute(sql`
      insert into public.points_ledger (user_id, delta, reason, ref_type, ref_id, season)
      values (${accountId}, -300, 'redeem', 'checkout', ${checkoutId}, '2026-estate')`);
    const total = expectedTotal(300);
    await tx((transaction) =>
      recordCompletedSession(transaction, sessionObject({ sessionId, checkoutId, amountTotal: total, paymentStatus: "unpaid" }) as unknown as Stripe.Checkout.Session),
    );

    const failedEvent = `evt_int_${tag}_async_ko`;
    createdEventIds.push(failedEvent);
    expect(
      await handleStripeEvent(completedEvent(failedEvent, sessionObject({ sessionId, checkoutId, amountTotal: total }), "checkout.session.async_payment_failed")),
    ).toBe("order_cancelled");
    expect((await orderBySession(sessionId))?.status).toBe("cancelled");
    expect(await pointsLedgerRows(accountId, "redeem_refund", checkoutId)).toBe(1);

    expect(
      await handleStripeEvent(
        completedEvent(`evt_int_${tag}_async_ko2`, sessionObject({ sessionId, checkoutId, amountTotal: total }), "checkout.session.async_payment_failed"),
      ),
    ).toBe("ignored");
    createdEventIds.push(`evt_int_${tag}_async_ko2`);
    expect(await pointsLedgerRows(accountId, "redeem_refund", checkoutId)).toBe(1);
    expect(await balanceOf(accountId)).toBe(before);
  });
});

describe("ospite e lettura dell'ordine", () => {
  it("ospite: il token del link apre l'ordine senza costi; un token sbagliato o l'hash del token non aprono nulla", async () => {
    const { checkoutId, sessionId } = await createCheckout({ userId: null, shippingCents: SHIPPING });
    const eventId = `evt_int_${tag}_guest`;
    createdEventIds.push(eventId);
    const result = await tx((transaction) =>
      recordCompletedSession(transaction, sessionObject({ sessionId, checkoutId, amountTotal: expectedTotal(0), email: `ospite-${tag}@example.com` }) as unknown as Stripe.Checkout.Session),
    );
    expect(result.outcome).toBe("order_created");
    const order = await orderBySession(sessionId);
    expect(order?.userId).toBeNull();
    expect(order?.accessTokenHash).toMatch(/^[0-9a-f]{64}$/);

    // Il token in chiaro esce solo dagli effetti: qui lo prendiamo da una nuova rotazione (inoltro e spedizione).
    await tx((transaction) => markForwardedTx(transaction, { orderId: order?.id ?? "", actorId: adminId, now: new Date() }));
    const shipped = await tx((transaction) =>
      shipOrderTx(transaction, {
        orderId: order?.id ?? "",
        actorId: adminId,
        carrier: "BRT",
        trackingNumber: `TRK-${tag}`,
        trackingUrl: "https://tracking.example/TRK",
        now: new Date(),
      }),
    );
    expect(shipped.ok).toBe(true);
    if (!shipped.ok) return;
    const token = shipped.effects[0]?.accessToken ?? "";
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const view = await getGuestOrder(order?.orderNumber ?? "", token);
    expect(view).not.toBeNull();
    expect(view?.status).toBe("shipped");
    expect(view?.trackingNumber).toBe(`TRK-${tag}`);
    expect(view?.items[0]).toMatchObject({ title: "int- crema di prova", quantity: lineQuantity, unitPriceCents: unitPrice, vatRate: 10 });
    expect(JSON.stringify(view)).not.toContain("costCents");
    expect(JSON.stringify(view)).not.toContain("supplier");

    expect(await getGuestOrder(order?.orderNumber ?? "", "x".repeat(43))).toBeNull();
    expect(await getGuestOrder(order?.orderNumber ?? "", token.replace(/.$/, (c) => (c === "a" ? "b" : "a")))).toBeNull();
    expect(await getGuestOrder(order?.orderNumber ?? "", "corto")).toBeNull();
    // L'hash del token non apre l'ordine: serve il token del link.
    expect(await getGuestOrder(order?.orderNumber ?? "", hashAccessToken(token))).toBeNull();
    expect(await getGuestOrder("ISU-2099-000001", token)).toBeNull();
  });

  it("il token ruotato dalla spedizione rende inutilizzabile il link precedente", async () => {
    const { checkoutId, sessionId } = await createCheckout({ userId: null });
    const first = await tx((transaction) =>
      recordCompletedSession(transaction, sessionObject({ sessionId, checkoutId, amountTotal: expectedTotal(0), email: `ospite2-${tag}@example.com` }) as unknown as Stripe.Checkout.Session),
    );
    const order = await orderBySession(sessionId);
    const firstToken = first.effects[0]?.accessToken ?? "";
    expect(firstToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await getGuestOrder(order?.orderNumber ?? "", firstToken)).not.toBeNull();

    await tx((transaction) => markForwardedTx(transaction, { orderId: order?.id ?? "", actorId: adminId, now: new Date() }));
    // La spedizione genera un token nuovo: il primo smette di valere.
    await tx((transaction) =>
      shipOrderTx(transaction, { orderId: order?.id ?? "", actorId: adminId, carrier: "GLS", trackingNumber: "G1", trackingUrl: null, now: new Date() }),
    );
    expect(await getGuestOrder(order?.orderNumber ?? "", firstToken)).toBeNull();
  });

  it("account: il proprietario vede il suo ordine, un altro utente no; la pagina di esito trova il numero", async () => {
    const { checkoutId, sessionId } = await createCheckout({ userId: accountId });
    await handleStripeEvent(
      completedEvent(`evt_int_${tag}_mine`, sessionObject({ sessionId, checkoutId, amountTotal: expectedTotal(0) })),
    );
    createdEventIds.push(`evt_int_${tag}_mine`);
    const order = await orderBySession(sessionId);
    const owner = { id: accountId, email: accountEmail, is_anonymous: false };
    const stranger = { id: otherAccountId, email: `int-orders-altro-${tag}@example.com`, is_anonymous: false };

    const mine = await getMyOrder(owner, order?.orderNumber ?? "");
    expect(mine?.orderNumber).toBe(order?.orderNumber);
    expect(mine?.items).toHaveLength(1);
    expect(await getMyOrder(stranger, order?.orderNumber ?? "")).toBeNull();

    const list = await listMyOrders(owner);
    expect(list.map((row) => row.orderNumber)).toContain(order?.orderNumber);
    expect(await listMyOrders(stranger)).toHaveLength(0);

    expect(await orderForCheckoutSession(sessionId)).toEqual({ orderNumber: order?.orderNumber, status: "paid" });
    expect(await orderForCheckoutSession("cs_test_inesistente_int")).toBeNull();
    expect(await orderForCheckoutSession("non valido")).toBeNull();
  });
});

describe("transizioni admin: audit, inoltro, spedizione, consegna, punti una volta", () => {
  it("inoltro, spedizione, problema e consegna: ogni passo scrive l'audit e i punti arrivano una sola volta", async () => {
    const { checkoutId, sessionId } = await createCheckout({ userId: accountId });
    await handleStripeEvent(
      completedEvent(`evt_int_${tag}_flow`, sessionObject({ sessionId, checkoutId, amountTotal: expectedTotal(0) })),
    );
    createdEventIds.push(`evt_int_${tag}_flow`);
    const order = await orderBySession(sessionId);
    const orderId = order?.id ?? "";
    const pointsBefore = await balanceOf(accountId);

    // La spedizione prima dell'inoltro non si registra.
    const early = await tx((transaction) =>
      shipOrderTx(transaction, { orderId, actorId: adminId, carrier: "BRT", trackingNumber: "T0", trackingUrl: null, now: new Date() }),
    );
    expect(early).toEqual({ ok: false, code: "invalid_state" });

    const forwarded = await tx((transaction) => markForwardedTx(transaction, { orderId, actorId: adminId, now: new Date() }));
    expect(forwarded.ok).toBe(true);
    const forwardedAgain = await tx((transaction) => markForwardedTx(transaction, { orderId, actorId: adminId, now: new Date() }));
    expect(forwardedAgain).toEqual({ ok: false, code: "invalid_state" });

    const shipped = await tx((transaction) =>
      shipOrderTx(transaction, { orderId, actorId: adminId, carrier: "BRT", trackingNumber: `TRK-${tag}-2`, trackingUrl: null, now: new Date() }),
    );
    expect(shipped.ok).toBe(true);

    const problem = await tx((transaction) => markProblemTx(transaction, { orderId, actorId: adminId, note: "ritardo del corriere" }));
    expect(problem.ok).toBe(true);

    const delivered = await tx((transaction) => deliverOrderTx(transaction, { orderId, actorId: adminId, now: new Date() }));
    expect(delivered.ok).toBe(true);
    if (!delivered.ok) return;
    expect(delivered.pointsAwarded).toBe(Math.floor(expectedTotal(0) / 100));
    expect(await pointsLedgerRows(accountId, "order", orderId)).toBe(1);
    expect(await balanceOf(accountId)).toBe(pointsBefore + delivered.pointsAwarded);

    // Consegnare due volte non accredita di nuovo.
    const again = await tx((transaction) => deliverOrderTx(transaction, { orderId, actorId: adminId, now: new Date() }));
    expect(again).toEqual({ ok: false, code: "invalid_state" });
    expect(await pointsLedgerRows(accountId, "order", orderId)).toBe(1);

    const actions = await dbAdmin
      .select({ action: adminAuditLog.action })
      .from(adminAuditLog)
      .where(and(eq(adminAuditLog.entityId, orderId), eq(adminAuditLog.entity, "order")));
    expect(actions.map((row) => row.action).sort()).toEqual(
      ["order.delivered", "order.forwarded", "order.problem", "order.shipped"].sort(),
    );

    const [final] = await dbAdmin.select().from(orders).where(eq(orders.id, orderId));
    expect(final?.status).toBe("delivered");
    expect(final?.supplierStatus).toBe("delivered");
    expect(final?.deliveredAt).not.toBeNull();
  });

  it("revisione: chiusa la revisione, l'ordine pagato riceve la conferma (effetto paid)", async () => {
    const { checkoutId, sessionId } = await createCheckout({ userId: accountId });
    await tx((transaction) =>
      recordCompletedSession(transaction, sessionObject({ sessionId, checkoutId, amountTotal: expectedTotal(0) - 100 }) as unknown as Stripe.Checkout.Session),
    );
    const order = await orderBySession(sessionId);
    const orderId = order?.id ?? "";
    expect(order?.needsReview).toBe(true);
    const cleared = await tx((transaction) => clearReviewTx(transaction, { orderId, actorId: adminId }));
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.effects).toEqual([{ kind: "paid", orderId, accessToken: null }]);
    const [after] = await dbAdmin.select().from(orders).where(eq(orders.id, orderId));
    expect(after?.needsReview).toBe(false);
  });

  it("revisione per email mancante o checkout chiuso: non si sblocca", async () => {
    // Email mancante: il segnaposto resta, quindi la revisione non si chiude.
    const noEmail = await createCheckout({ userId: accountId });
    await tx((transaction) =>
      recordCompletedSession(transaction, sessionObject({ sessionId: noEmail.sessionId, checkoutId: noEmail.checkoutId, amountTotal: expectedTotal(0), email: "" }) as unknown as Stripe.Checkout.Session),
    );
    const noEmailOrder = await orderBySession(noEmail.sessionId);
    expect(await tx((transaction) => clearReviewTx(transaction, { orderId: noEmailOrder?.id ?? "", actorId: adminId }))).toEqual({
      ok: false,
      code: "not_clearable",
    });

    // Checkout già scaduto quando arriva il pagamento: revisione per checkout_closed, non sbloccabile.
    const closed = await createCheckout({ userId: accountId, status: "expired" });
    await tx((transaction) =>
      recordCompletedSession(transaction, sessionObject({ sessionId: closed.sessionId, checkoutId: closed.checkoutId, amountTotal: expectedTotal(0) }) as unknown as Stripe.Checkout.Session),
    );
    const closedOrder = await orderBySession(closed.sessionId);
    expect(closedOrder?.needsReview).toBe(true);
    expect(await tx((transaction) => clearReviewTx(transaction, { orderId: closedOrder?.id ?? "", actorId: adminId }))).toEqual({
      ok: false,
      code: "not_clearable",
    });
  });

  it("rimando del link: rotazione del token, audit order.link_resent, email di conferma senza inoltro", async () => {
    mocks.emailResult = "sent";
    mocks.emailCalls.length = 0;
    const { checkoutId, sessionId } = await createCheckout({ userId: null });
    const first = await tx((transaction) =>
      recordCompletedSession(transaction, sessionObject({ sessionId, checkoutId, amountTotal: expectedTotal(0), email: `rimando-${tag}@example.com` }) as unknown as Stripe.Checkout.Session),
    );
    const order = await orderBySession(sessionId);
    const oldToken = first.effects[0]?.accessToken ?? "";
    mocks.emailCalls.length = 0;

    const resent = await tx((transaction) => resendOrderLinkTx(transaction, { orderId: order?.id ?? "", actorId: adminId }));
    expect(resent.ok).toBe(true);
    if (!resent.ok) return;
    const newToken = resent.effects[0]?.accessToken ?? "";
    expect(newToken).not.toBe(oldToken);
    expect(await getGuestOrder(order?.orderNumber ?? "", oldToken)).toBeNull();
    expect(await getGuestOrder(order?.orderNumber ?? "", newToken)).not.toBeNull();

    await runOrderEffects(resent.effects);
    expect(mocks.emailCalls.map((call) => call.to)).toEqual([`rimando-${tag}@example.com`]);
    expect(mocks.emailCalls.some((call) => call.to.startsWith("fornitore-"))).toBe(false);

    const audited = await dbAdmin
      .select({ action: adminAuditLog.action })
      .from(adminAuditLog)
      .where(and(eq(adminAuditLog.entityId, order?.id ?? ""), eq(adminAuditLog.action, "order.link_resent")));
    expect(audited).toHaveLength(1);
    mocks.emailResult = "unavailable";
  });
});

describe("effetti dopo il commit", () => {
  it("con posta disponibile: conferma al cliente e inoltro al fornitore, che passa a forwarded", async () => {
    mocks.emailResult = "sent";
    mocks.emailCalls.length = 0;
    const { checkoutId, sessionId } = await createCheckout({ userId: accountId });
    const eventId = `evt_int_${tag}_mail`;
    createdEventIds.push(eventId);
    await handleStripeEvent(completedEvent(eventId, sessionObject({ sessionId, checkoutId, amountTotal: expectedTotal(0) })));
    const order = await orderBySession(sessionId);
    expect(mocks.emailCalls.map((call) => call.to)).toEqual(
      expect.arrayContaining([accountEmail, `fornitore-${tag}@example.com`]),
    );
    expect(order?.supplierStatus).toBe("forwarded");
    expect(order?.forwardedAt).not.toBeNull();
    mocks.emailResult = "unavailable";
  });
});

describe("cron: avviso del fornitore in ritardo e consegna automatica", () => {
  it("le regole: avviso una volta (anche per email se configurata), consegna dopo 10 giorni con i punti una volta", async () => {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const previousAdmin = process.env.ORDERS_ADMIN_EMAIL;
    process.env.ORDERS_ADMIN_EMAIL = `admin-${tag}@example.com`;
    mocks.emailResult = "sent";
    mocks.emailCalls.length = 0;
    try {
      // Ordine inoltrato 10 giorni fa, senza tracking: il tempo di evasione è 3 giorni, più 2 di tolleranza.
      const late = await createPaidOrder({ userId: accountId, supplierStatus: "forwarded", forwardedAt: new Date(now.getTime() - 10 * day) });
      // Ordine inoltrato ieri: non è in ritardo.
      const fresh = await createPaidOrder({ userId: accountId, supplierStatus: "forwarded", forwardedAt: new Date(now.getTime() - day) });
      // Ordine spedito 11 giorni fa: consegna automatica con i punti.
      const old = await createPaidOrder({
        userId: accountId,
        status: "shipped",
        supplierStatus: "shipped",
        shippedAt: new Date(now.getTime() - 11 * day),
        trackingNumber: "TRK-OLD",
      });
      // Ordine spedito 2 giorni fa: resta spedito.
      const recent = await createPaidOrder({
        userId: accountId,
        status: "shipped",
        supplierStatus: "shipped",
        shippedAt: new Date(now.getTime() - 2 * day),
        trackingNumber: "TRK-NEW",
      });

      const pointsBefore = await balanceOf(accountId);
      const first = await runOrdersCron(now);
      expect(first.delayNotices).toBeGreaterThanOrEqual(1);
      expect(first.delivered).toBeGreaterThanOrEqual(1);
      expect(first.delayEmail).toBe("sent");
      expect(mocks.emailCalls.some((call) => call.to === `admin-${tag}@example.com`)).toBe(true);

      const [lateRow] = await dbAdmin.select().from(orders).where(eq(orders.id, late.id));
      expect(lateRow?.supplierDelayNotifiedAt).not.toBeNull();
      const [freshRow] = await dbAdmin.select().from(orders).where(eq(orders.id, fresh.id));
      expect(freshRow?.supplierDelayNotifiedAt).toBeNull();

      const [oldRow] = await dbAdmin.select().from(orders).where(eq(orders.id, old.id));
      expect(oldRow?.status).toBe("delivered");
      expect(oldRow?.supplierStatus).toBe("delivered");
      const awarded = Math.floor(oldRow?.totalCents ? oldRow.totalCents / 100 : 0);
      expect(await pointsLedgerRows(accountId, "order", old.id)).toBe(1);
      expect(await balanceOf(accountId)).toBe(pointsBefore + awarded);

      const [recentRow] = await dbAdmin.select().from(orders).where(eq(orders.id, recent.id));
      expect(recentRow?.status).toBe("shipped");

      // Seconda esecuzione: nessun nuovo avviso, nessuna nuova consegna, nessun punto in più.
      const noticeAt = lateRow?.supplierDelayNotifiedAt;
      const second = await runOrdersCron(now);
      const [lateAgain] = await dbAdmin.select().from(orders).where(eq(orders.id, late.id));
      expect(lateAgain?.supplierDelayNotifiedAt).toEqual(noticeAt);
      expect(second.pointsAwarded).toBe(0);
      expect(await pointsLedgerRows(accountId, "order", old.id)).toBe(1);
      expect(await balanceOf(accountId)).toBe(pointsBefore + awarded);
    } finally {
      if (previousAdmin === undefined) delete process.env.ORDERS_ADMIN_EMAIL;
      else process.env.ORDERS_ADMIN_EMAIL = previousAdmin;
      mocks.emailResult = "unavailable";
    }
  });

  it("ordine di ospite consegnato automaticamente: nessun punto", async () => {
    const guest = await createPaidOrder({
      userId: null,
      status: "shipped",
      supplierStatus: "shipped",
      shippedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
      trackingNumber: "TRK-G",
    });
    await runOrdersCron(new Date());
    const [row] = await dbAdmin.select().from(orders).where(eq(orders.id, guest.id));
    expect(row?.status).toBe("delivered");
    const [points] = await dbAdmin.execute<{ n: number }>(
      sql`select count(*)::int as n from public.points_ledger where ref_id = ${guest.id}::uuid`,
    );
    expect(Number(points?.n ?? 0)).toBe(0);
  });
});

describe("elenco admin, export CSV e riconciliazione", () => {
  it("elenco con l'ordine da inoltrare a mano, e CSV del periodo con la riga dell'ordine", async () => {
    const pending = await createPaidOrder({ userId: accountId, supplierStatus: "pending" });
    const rows = await listOrdersAdmin({ attention: "to_forward", limit: 200 });
    const found = rows.find((row) => row.id === pending.id);
    expect(found?.toForwardByHand).toBe(true);

    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
    const csv = await exportOrdersCsv({ from: today, to: today });
    const [header, ...lines] = csv.split("\r\n").filter(Boolean);
    expect(header).toContain('"imponibile_10"');
    expect(header).toContain('"in_revisione"');
    const line = lines.find((item) => item.includes(`"${pending.orderNumber}"`));
    expect(line).toBeDefined();
    // Costo d'acquisto: 600 centesimi per unità, due unità. Totale 3690 centesimi = 36.90.
    expect(line).toContain('"12.00"');
    expect(line?.endsWith('"no"')).toBe(true);
  });

  it("riconciliazione: per ogni ordine, imponibile più IVA di tutte le aliquote è il totale incassato", async () => {
    const pending = await createPaidOrder({ userId: accountId, supplierStatus: "pending" });
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
    const csv = await exportOrdersCsv({ from: today, to: today });
    const [header, ...lines] = csv.split("\r\n").filter(Boolean);
    const columns = (header ?? "").split(",").map((name) => name.replace(/"/g, ""));
    const line = lines.find((item) => item.includes(`"${pending.orderNumber}"`));
    const values = (line ?? "").split(",").map((cell) => cell.replace(/"/g, ""));
    const cell = (name: string) => values[columns.indexOf(name)] ?? "";
    const toCents = (decimal: string) => Math.round(Number(decimal) * 100);
    const collected = toCents(cell("imponibile_4")) + toCents(cell("iva_4")) + toCents(cell("imponibile_10")) + toCents(cell("iva_10")) + toCents(cell("imponibile_22")) + toCents(cell("iva_22"));
    expect(collected).toBe(toCents(cell("totale")));
    expect(toCents(cell("totale"))).toBe(expectedTotal(0));
    // La spedizione è solo informativa, ma compresa nelle quote: 6.90 nella colonna dedicata.
    expect(cell("spedizione")).toBe("6.90");
  });

  it("periodo non valido: errore", async () => {
    await expect(exportOrdersCsv({ from: "2026-10-20", to: "2026-10-01" })).rejects.toThrow(RangeError);
  });
});

describe("route e azioni: autorizzazione, modalità finta e validazione", () => {
  it("cron: senza CRON_SECRET giusto → 401, con il segreto → 200 con il rapporto", async () => {
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = `cron-${tag}`;
    try {
      const url = "http://localhost/api/cron/shop";
      const denied = await cronGet(new NextRequest(url));
      expect(denied.status).toBe(401);
      const allowed = await cronGet(new NextRequest(url, { headers: { authorization: `Bearer cron-${tag}` } }));
      expect(allowed.status).toBe(200);
      expect(await allowed.json()).toMatchObject({ delayNotices: expect.any(Number), delivered: expect.any(Number) });
    } finally {
      if (previous === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previous;
    }
  });

  it("route di test (solo modalità finta, mai in production): completa una sessione e crea l'ordine", async () => {
    const { checkoutId } = await createCheckout({ userId: accountId });
    const post = () =>
      testCompletePost(
        new Request("http://localhost/api/stripe/test-complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ checkoutId, email: accountEmail }),
        }),
      );
    try {
      vi.stubEnv("CHECKOUT_TEST_PROVIDER", "");
      expect((await post()).status).toBe(404);

      vi.stubEnv("CHECKOUT_TEST_PROVIDER", "fake");
      // In produzione fuori dalla CI il provider finto è spento.
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("CI", "false");
      expect((await post()).status).toBe(404);

      vi.stubEnv("NODE_ENV", "test");
      const on = await post();
      expect(on.status).toBe(200);
      expect(await on.json()).toMatchObject({ outcome: "order_created" });
      // La route usa l'id di sessione del provider finto (cs_fake_…), non quello del checkout.
      const order = await orderBySession(fakeSessionId(checkoutId));
      expect(order?.status).toBe("paid");
      expect(order?.totalCents).toBe(expectedTotal(0));
      expect(order?.paidAmountCents).toBe(expectedTotal(0));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("CSV: senza sessione 401, sessione non admin 404, admin con periodo valido 200, periodo invertito 400", async () => {
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
    const url = `http://localhost/it/admin/ordini/esporta?from=${today}&to=${today}`;

    mocks.auth.userId = null;
    expect((await csvGet(new NextRequest(url))).status).toBe(401);

    mocks.auth.userId = accountId;
    mocks.auth.role = "user";
    expect((await csvGet(new NextRequest(url))).status).toBe(404);

    mocks.auth.role = "admin";
    const ok = await csvGet(new NextRequest(url));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("text/csv");
    expect(ok.headers.get("content-disposition")).toContain(`ordini-${today}-${today}.csv`);
    expect(await ok.text()).toContain('"numero"');

    const inverted = await csvGet(new NextRequest("http://localhost/it/admin/ordini/esporta?from=2026-10-20&to=2026-10-01"));
    expect(inverted.status).toBe(400);
    mocks.auth.userId = null;
  });

  it("azioni admin: input non valido rifiutato prima di toccare il database", async () => {
    expect(await markOrderDeliveredAction({ orderId: "non-uuid" })).toEqual({ status: "error", code: "invalid" });
    expect(await reportOrderProblemAction({ orderId: randomUUID(), note: "   " })).toEqual({ status: "error", code: "invalid" });
    expect(
      await shipOrderAction({ orderId: randomUUID(), carrier: "BRT", trackingNumber: "T1", trackingUrl: "http://insicuro.example" }),
    ).toEqual({ status: "error", code: "invalid" });
    expect(await shipOrderAction({ orderId: randomUUID(), carrier: "", trackingNumber: "T1" })).toEqual({
      status: "error",
      code: "invalid",
    });
  });

  it("azione admin su un ordine inesistente: not_found, nessun effetto", async () => {
    expect(await markOrderDeliveredAction({ orderId: randomUUID() })).toEqual({ status: "error", code: "not_found" });
  });
});

// Ordine pagato di prova, creato direttamente (per il cron e l'export). Le righe hanno lo stesso prodotto.
async function createPaidOrder(opts: {
  userId: string | null;
  status?: "paid" | "shipped";
  supplierStatus?: "pending" | "forwarded" | "shipped";
  forwardedAt?: Date;
  shippedAt?: Date;
  trackingNumber?: string;
}) {
  const id = randomUUID();
  const stripeSession = `cs_test_int_order_${id.replace(/-/g, "")}`;
  const total = expectedTotal(0);
  await dbAdmin.insert(orders).values({
    id,
    userId: opts.userId,
    email: `ordine-${tag}-${id.slice(0, 8)}@example.com`,
    status: opts.status ?? "paid",
    supplierStatus: opts.supplierStatus ?? "pending",
    subtotalCents: SUBTOTAL,
    discountCents: 0,
    shippingCents: SHIPPING,
    totalCents: total,
    stripeSessionId: stripeSession,
    shippingAddress: { name: "Test", phone: null, line1: "Via 1", line2: null, postalCode: "90100", city: "Palermo", province: null, country: "IT" },
    forwardedAt: opts.forwardedAt ?? null,
    shippedAt: opts.shippedAt ?? null,
    trackingNumber: opts.trackingNumber ?? null,
    carrier: opts.trackingNumber ? "BRT" : null,
  });
  await dbAdmin.insert(orderItems).values({
    orderId: id,
    productId,
    producerId,
    supplierId,
    supplierSku: `int-sku-${tag}`,
    titleSnapshot: "int- crema di prova",
    quantity: lineQuantity,
    unitPriceCents: unitPrice,
    vatRate: 10,
    costCentsSnapshot: 600,
  });
  createdOrderIds.push(id);
  const [row] = await dbAdmin.select().from(orders).where(eq(orders.id, id));
  if (!row) throw new Error("createPaidOrder: riga non trovata");
  return row;
}
