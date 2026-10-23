import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { STRIPE_API_VERSION, fakeGateway, fakeSessionId, verifyWebhook } from "./checkout-gateway";

const SECRET = "whsec_test_unit";
const CHECKOUT = "44444444-4444-4444-8444-444444444444";

function signed(payload: string, secret: string = SECRET): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret });
}

const event = JSON.stringify({
  id: "evt_test_1",
  object: "event",
  type: "checkout.session.expired",
  data: { object: { id: "cs_fake_x", object: "checkout.session", metadata: { checkout_id: CHECKOUT } } },
});

describe("verifyWebhook", () => {
  it("firma valida: restituisce l'evento", () => {
    const parsed = verifyWebhook(event, signed(event), SECRET);
    expect(parsed.id).toBe("evt_test_1");
    expect(parsed.type).toBe("checkout.session.expired");
  });

  it("firma con un altro segreto o corpo alterato: errore", () => {
    expect(() => verifyWebhook(event, signed(event, "altro"), SECRET)).toThrow();
    expect(() => verifyWebhook(event.replace("evt_test_1", "evt_test_2"), signed(event), SECRET)).toThrow();
  });

  it("intestazione vuota o senza firma valida: errore", () => {
    expect(() => verifyWebhook(event, "", SECRET)).toThrow();
    expect(() => verifyWebhook(event, "t=1,v1=00", SECRET)).toThrow();
  });
});

describe("provider finto", () => {
  it("l'id di sessione è cs_ seguito da lettere e cifre, e l'URL punta alla pagina di prova", async () => {
    expect(fakeSessionId(CHECKOUT)).toMatch(/^cs_[A-Za-z0-9_]+$/);
    const session = await fakeGateway().createSession({
      checkoutId: CHECKOUT,
      locale: "it",
      lines: [],
      shippingCents: 0,
      couponId: null,
      customerEmail: null,
      siteUrl: "http://localhost:3000",
      expiresAtSeconds: 0,
    });
    expect(session.id).toBe(fakeSessionId(CHECKOUT));
    expect(session.url).toBe(`http://localhost:3000/it/carrello/prova-pagamento?sessione=${session.id}`);
  });

  it("versione dell'API Stripe fissata", () => {
    expect(STRIPE_API_VERSION).toBe("2026-03-25.dahlia");
  });
});
