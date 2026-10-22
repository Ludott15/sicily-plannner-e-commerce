import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { readSessionFacts } from "./order-session";

// Sessione Stripe minima con la forma usata dalla versione dell'API fissata: l'indirizzo sta in
// collected_information.shipping_details, telefono ed email in customer_details.
function session(overrides: Record<string, unknown> = {}): Stripe.Checkout.Session {
  const base = {
    id: "cs_test_abc123",
    object: "checkout.session",
    metadata: { checkout_id: "5f9d1c52-7b3a-4c1e-9d2f-0a1b2c3d4e5f" },
    payment_status: "paid",
    payment_intent: "pi_test_123",
    amount_total: 3090,
    currency: "eur",
    locale: "it",
    customer_details: { email: "maria@example.com", name: "Maria Rossi", phone: "+39 333 0000000" },
    collected_information: {
      shipping_details: {
        name: "Maria Rossi",
        address: {
          line1: "Via Roma 1",
          line2: null,
          city: "Palermo",
          state: "PA",
          postal_code: "90100",
          country: "IT",
        },
      },
    },
  };
  return { ...base, ...overrides } as unknown as Stripe.Checkout.Session;
}

describe("readSessionFacts", () => {
  it("legge importo, valuta, email, indirizzo e telefono di una sessione pagata", () => {
    const facts = readSessionFacts(session());
    expect(facts).toEqual({
      sessionId: "cs_test_abc123",
      checkoutId: "5f9d1c52-7b3a-4c1e-9d2f-0a1b2c3d4e5f",
      paymentStatus: "paid",
      paymentIntentId: "pi_test_123",
      amountTotalCents: 3090,
      currency: "eur",
      email: "maria@example.com",
      locale: "it",
      shippingAddress: {
        name: "Maria Rossi",
        line1: "Via Roma 1",
        line2: null,
        postalCode: "90100",
        city: "Palermo",
        province: "PA",
        country: "IT",
        phone: "+39 333 0000000",
      },
    });
  });

  it("checkout_id mancante o non UUID: null (la sessione non si collega a nulla)", () => {
    expect(readSessionFacts(session({ metadata: {} })).checkoutId).toBeNull();
    expect(readSessionFacts(session({ metadata: { checkout_id: "non-uuid" } })).checkoutId).toBeNull();
  });

  it("indirizzo incompleto: null, così l'ordine va in revisione", () => {
    const incomplete = session({
      collected_information: { shipping_details: { name: "X", address: { line1: "", city: "Palermo", postal_code: "90100", country: "IT" } } },
    });
    expect(readSessionFacts(incomplete).shippingAddress).toBeNull();
    expect(readSessionFacts(session({ collected_information: null })).shippingAddress).toBeNull();
  });

  it("payment_intent come oggetto o come id", () => {
    expect(readSessionFacts(session({ payment_intent: { id: "pi_obj_9" } })).paymentIntentId).toBe("pi_obj_9");
    expect(readSessionFacts(session({ payment_intent: null })).paymentIntentId).toBeNull();
  });

  it("lingua: inglese solo se la sessione è in inglese, altrimenti italiano", () => {
    expect(readSessionFacts(session({ locale: "en-GB" })).locale).toBe("en");
    expect(readSessionFacts(session({ locale: "auto" })).locale).toBe("it");
    expect(readSessionFacts(session({ locale: null })).locale).toBe("it");
  });

  it("pagamento asincrono: stato unpaid", () => {
    expect(readSessionFacts(session({ payment_status: "unpaid" })).paymentStatus).toBe("unpaid");
  });
});
