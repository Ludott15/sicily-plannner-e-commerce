import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as webhookPost } from "@/app/api/stripe/webhook/route";
import { dbAdmin } from "@/server/db/admin";
import { checkoutSessions, producers, products, stripeEvents, suppliers } from "@/server/db/schema";
import { loadCart } from "./cart";
import { readPointsOffer, runCheckout } from "./checkout";
import { fakeGateway, verifyWebhook } from "./checkout-gateway";
import { handleStripeEvent } from "./stripe-webhook.admin";

// Checkout con il database reale (passo 7.2): snapshot dai prezzi del database, punti scalati una volta,
// ospiti senza punti, scadenza che restituisce i punti una sola volta, webhook con firma e idempotenza.
// Il provider è quello finto (nessuna chiamata a Stripe). Dati con prefisso int- e pulizia a fine suite.

const tag = `k${Date.now()}`;
const SITE = "http://localhost:3000";
const WEBHOOK_SECRET = "whsec_int_checkout_test";

const account = { id: randomUUID(), email: `int-checkout-${tag}@example.com`, is_anonymous: false };
const guest = { id: randomUUID(), is_anonymous: true };
const supplierId = randomUUID();
const producerId = randomUUID();
const productId = randomUUID();
const createdCheckoutIds: string[] = [];
const createdEventIds: string[] = [];
let previousWebhookSecret: string | undefined;

function cartFor(quantity: number) {
  return [{ productId, quantity }];
}

async function balanceOf(userId: string): Promise<number> {
  const [row] = await dbAdmin.execute<{ n: number }>(
    sql`select coalesce(sum(delta), 0)::int as n from public.points_ledger where user_id = ${userId}`,
  );
  return Number(row?.n ?? 0);
}

async function refundRows(checkoutId: string): Promise<number> {
  const [row] = await dbAdmin.execute<{ n: number }>(
    sql`select count(*)::int as n from public.points_ledger where reason = 'redeem_refund' and ref_id = ${checkoutId}`,
  );
  return Number(row?.n ?? 0);
}

function expiredEvent(eventId: string, checkoutId: string): string {
  return JSON.stringify({
    id: eventId,
    object: "event",
    livemode: false,
    type: "checkout.session.expired",
    data: {
      object: {
        id: `cs_test_int_${checkoutId.replace(/-/g, "")}`,
        object: "checkout.session",
        metadata: { checkout_id: checkoutId },
      },
    },
  });
}

beforeAll(async () => {
  previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

  await dbAdmin.execute(sql`
    insert into auth.users (id, email, raw_user_meta_data) values (${account.id}, ${account.email}, '{"full_name":"int-checkout"}')`);
  await dbAdmin.execute(sql`insert into auth.users (id, is_anonymous) values (${guest.id}, true)`);
  await dbAdmin.execute(sql`
    insert into public.points_ledger (user_id, delta, reason, ref_type, ref_id, season)
    values (${account.id}, 1000, 'admin_adjust', 'int', ${randomUUID()}, '2026-estate')`);
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
    email: `produttore-${tag}@example.com`,
    isPublic: true,
    isActive: true,
  });
  await dbAdmin.insert(products).values({
    id: productId,
    slug: `int-prodotto-${tag}`,
    producerId,
    supplierId,
    title: "int- crema di prova",
    category: "dolci",
    priceCents: 2000,
    vatRate: 10,
    formatLabel: "vasetto 190 g",
    ingredientsIt: "pistacchi, zucchero",
    allergensDeclared: true,
    isActive: true,
    stockStatus: "available",
  });
});

afterAll(async () => {
  if (createdCheckoutIds.length > 0) {
    await dbAdmin.delete(checkoutSessions).where(inArray(checkoutSessions.id, createdCheckoutIds));
  }
  if (createdEventIds.length > 0) {
    await dbAdmin.delete(stripeEvents).where(inArray(stripeEvents.id, createdEventIds));
  }
  await dbAdmin.delete(products).where(eq(products.id, productId));
  await dbAdmin.delete(producers).where(eq(producers.id, producerId));
  await dbAdmin.delete(suppliers).where(eq(suppliers.id, supplierId));
  await dbAdmin.execute(sql`delete from auth.users where id in (${account.id}, ${guest.id})`);
  if (previousWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;
});

describe("carrello: prezzi dal database", () => {
  it("la riga prende il prezzo corrente del prodotto, non quello di quando è stato aggiunto", async () => {
    const before = await loadCart(cartFor(2), "it");
    expect(before.view.lines[0]?.unitPriceCents).toBe(2000);

    await dbAdmin.update(products).set({ priceCents: 2500 }).where(eq(products.id, productId));
    try {
      const after = await loadCart(cartFor(2), "it");
      expect(after.view.lines[0]?.unitPriceCents).toBe(2500);
      expect(after.view.subtotalCents).toBe(5000);
    } finally {
      await dbAdmin.update(products).set({ priceCents: 2000 }).where(eq(products.id, productId));
    }
  });

  it("un prodotto indisponibile esce dal carrello e conta come riga scartata", async () => {
    await dbAdmin.update(products).set({ stockStatus: "unavailable" }).where(eq(products.id, productId));
    try {
      const loaded = await loadCart(cartFor(1), "it");
      expect(loaded.view.lines).toEqual([]);
      expect(loaded.droppedLines).toBe(1);
    } finally {
      await dbAdmin.update(products).set({ stockStatus: "available" }).where(eq(products.id, productId));
    }
  });
});

describe("checkout", () => {
  it("ospite: riga con lo snapshot del database, nessun punto, sessione collegata", async () => {
    const loaded = await loadCart(cartFor(2), "it");
    const outcome = await runCheckout({
      user: guest,
      customerEmail: null,
      lines: loaded.view.lines,
      droppedLines: loaded.droppedLines,
      usePoints: true,
      locale: "it",
      siteUrl: SITE,
      gateway: fakeGateway(),
    });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    createdCheckoutIds.push(outcome.checkoutId);

    expect(outcome.discountCents).toBe(0);
    const [row] = await dbAdmin.select().from(checkoutSessions).where(eq(checkoutSessions.id, outcome.checkoutId));
    expect(row?.userId).toBeNull();
    expect(row?.status).toBe("open");
    expect(row?.subtotalCents).toBe(4000);
    expect(row?.stripeSessionId).toBe(`cs_fake_${outcome.checkoutId.replace(/-/g, "")}`);
    expect(row?.cart).toEqual([
      expect.objectContaining({ productId, quantity: 2, unitPriceCents: 2000, vatRate: 10, title: "int- crema di prova" }),
    ]);
  });

  it("account con punti: sconto al 15% del subtotale, punti scalati una volta, saldo aggiornato", async () => {
    const before = await balanceOf(account.id);
    const loaded = await loadCart(cartFor(2), "it");
    const outcome = await runCheckout({
      user: account,
      customerEmail: account.email,
      lines: loaded.view.lines,
      droppedLines: loaded.droppedLines,
      usePoints: true,
      locale: "it",
      siteUrl: SITE,
      gateway: fakeGateway(),
    });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    createdCheckoutIds.push(outcome.checkoutId);

    // 15% di 40 euro = 6 euro = 600 punti.
    expect(outcome.discountCents).toBe(600);
    expect(outcome.pointsRedeemed).toBe(600);
    expect(await balanceOf(account.id)).toBe(before - 600);
    const offer = await readPointsOffer(account, 4000);
    expect(offer.balancePoints).toBe(before - 600);
  });

  it("prova a rovescio: un carrello con riga scartata non fa checkout", async () => {
    await dbAdmin.update(products).set({ stockStatus: "unavailable" }).where(eq(products.id, productId));
    try {
      const loaded = await loadCart(cartFor(1), "it");
      const outcome = await runCheckout({
        user: guest,
        customerEmail: null,
        lines: loaded.view.lines,
        droppedLines: loaded.droppedLines,
        usePoints: false,
        locale: "it",
        siteUrl: SITE,
        gateway: fakeGateway(),
      });
      expect(outcome).toEqual({ status: "error", code: "empty" });
    } finally {
      await dbAdmin.update(products).set({ stockStatus: "available" }).where(eq(products.id, productId));
    }
  });
});

describe("scadenza e webhook", () => {
  it("scadenza: la sessione si chiude e i punti tornano una volta sola, anche con evento ripetuto", async () => {
    const loaded = await loadCart(cartFor(2), "it");
    const balanceBefore = await balanceOf(account.id);
    const outcome = await runCheckout({
      user: account,
      customerEmail: account.email,
      lines: loaded.view.lines,
      droppedLines: loaded.droppedLines,
      usePoints: true,
      locale: "it",
      siteUrl: SITE,
      gateway: fakeGateway(),
    });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    createdCheckoutIds.push(outcome.checkoutId);
    expect(await balanceOf(account.id)).toBe(balanceBefore - outcome.pointsRedeemed);

    const eventId = `evt_int_${tag}_1`;
    createdEventIds.push(eventId);
    const event = verifyWebhook(
      expiredEvent(eventId, outcome.checkoutId),
      Stripe.webhooks.generateTestHeaderString({ payload: expiredEvent(eventId, outcome.checkoutId), secret: WEBHOOK_SECRET }),
      WEBHOOK_SECRET,
    );
    expect(await handleStripeEvent(event)).toBe("expired");
    expect(await handleStripeEvent(event)).toBe("duplicate");

    const otherEventId = `evt_int_${tag}_2`;
    createdEventIds.push(otherEventId);
    const other = verifyWebhook(
      expiredEvent(otherEventId, outcome.checkoutId),
      Stripe.webhooks.generateTestHeaderString({ payload: expiredEvent(otherEventId, outcome.checkoutId), secret: WEBHOOK_SECRET }),
      WEBHOOK_SECRET,
    );
    expect(await handleStripeEvent(other)).toBe("already_closed");

    expect(await balanceOf(account.id)).toBe(balanceBefore);
    expect(await refundRows(outcome.checkoutId)).toBe(1);
  });

  it("route del webhook: firma non valida 400, firma valida 200 e nessun effetto alla ripetizione", async () => {
    const eventId = `evt_int_${tag}_3`;
    createdEventIds.push(eventId);
    const payload = JSON.stringify({
      id: eventId,
      object: "event",
      livemode: false,
      type: "checkout.session.completed",
      data: { object: { id: `cs_test_int_${tag}`, object: "checkout.session", metadata: {} } },
    });
    const badResponse = await webhookPost(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=00" },
        body: payload,
      }),
    );
    expect(badResponse.status).toBe(400);

    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const send = () =>
      webhookPost(
        new Request("http://localhost/api/stripe/webhook", {
          method: "POST",
          headers: { "stripe-signature": header },
          body: payload,
        }),
      );
    const first = await send();
    expect(first.status).toBe(200);
    const second = await send();
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, outcome: "duplicate" });

    const [count] = await dbAdmin.execute<{ n: number }>(
      sql`select count(*)::int as n from public.stripe_events where id = ${eventId}`,
    );
    expect(count?.n).toBe(1);
  });

  it("route del webhook: evento live con chiave di test → 400 e nessuna registrazione", async () => {
    const eventId = `evt_int_${tag}_live`;
    createdEventIds.push(eventId);
    const payload = JSON.stringify({
      id: eventId,
      object: "event",
      livemode: true,
      type: "checkout.session.completed",
      data: { object: { id: `cs_live_int_${tag}`, object: "checkout.session", metadata: {} } },
    });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const response = await webhookPost(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": header },
        body: payload,
      }),
    );
    expect(response.status).toBe(400);
    const [count] = await dbAdmin.execute<{ n: number }>(
      sql`select count(*)::int as n from public.stripe_events where id = ${eventId}`,
    );
    expect(count?.n).toBe(0);
  });
});
