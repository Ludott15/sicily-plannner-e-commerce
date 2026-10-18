import { describe, expect, it } from "vitest";
import { buildCheckoutSessionParams, type CheckoutSessionInput } from "./checkout-params";

const CHECKOUT = "33333333-3333-4333-8333-333333333333";
const PRODUCT = "11111111-1111-4111-8111-111111111111";

function input(overrides: Partial<CheckoutSessionInput> = {}): CheckoutSessionInput {
  return {
    checkoutId: CHECKOUT,
    locale: "it",
    lines: [{ productId: PRODUCT, title: "Crema di pistacchio", unitPriceCents: 1200, quantity: 2 }],
    shippingCents: 690,
    couponId: null,
    customerEmail: null,
    siteUrl: "https://isula.example/",
    expiresAtSeconds: 1_900_000_000,
    ...overrides,
  };
}

describe("buildCheckoutSessionParams", () => {
  it("pagamento unico, righe con il prezzo passato dal server, IVA inclusa, in euro", () => {
    const params = buildCheckoutSessionParams(input());
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([
      {
        quantity: 2,
        price_data: {
          currency: "eur",
          unit_amount: 1200,
          tax_behavior: "inclusive",
          product_data: { name: "Crema di pistacchio", metadata: { product_id: PRODUCT } },
        },
      },
    ]);
  });

  it("spedizione: una tariffa per ordine, solo Italia, gratuita se zero", () => {
    const paid = buildCheckoutSessionParams(input());
    expect(paid.shipping_address_collection).toEqual({ allowed_countries: ["IT"] });
    expect(paid.shipping_options?.[0]?.shipping_rate_data?.fixed_amount).toEqual({ amount: 690, currency: "eur" });
    expect(paid.shipping_options?.[0]?.shipping_rate_data?.display_name).toBe("Spedizione");

    const free = buildCheckoutSessionParams(input({ shippingCents: 0, locale: "en" }));
    expect(free.shipping_options?.[0]?.shipping_rate_data?.fixed_amount?.amount).toBe(0);
    expect(free.shipping_options?.[0]?.shipping_rate_data?.display_name).toBe("Free shipping");
  });

  it("sconto punti: un coupon monouso in discounts; senza punti, nessuno sconto", () => {
    expect(buildCheckoutSessionParams(input({ couponId: "fake_coupon_x" })).discounts).toEqual([{ coupon: "fake_coupon_x" }]);
    expect(buildCheckoutSessionParams(input()).discounts).toBeUndefined();
  });

  it("URL di ritorno con il segnaposto di Stripe e il link alle condizioni", () => {
    const params = buildCheckoutSessionParams(input());
    expect(params.success_url).toBe("https://isula.example/it/carrello/esito?sessione={CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toBe("https://isula.example/it/carrello?annullato=1");
    expect(params.consent_collection).toEqual({ terms_of_service: "required" });
    expect(JSON.stringify(params.custom_text)).toContain("(https://isula.example/it/condizioni-di-vendita)");
  });

  it("metadati, scadenza, email dell'account e telefono", () => {
    const params = buildCheckoutSessionParams(input({ customerEmail: "cliente@example.com" }));
    expect(params.metadata).toEqual({ checkout_id: CHECKOUT });
    expect(params.payment_intent_data?.metadata).toEqual({ checkout_id: CHECKOUT });
    expect(params.client_reference_id).toBe(CHECKOUT);
    expect(params.expires_at).toBe(1_900_000_000);
    expect(params.customer_email).toBe("cliente@example.com");
    expect(params.phone_number_collection).toEqual({ enabled: true });
    expect(buildCheckoutSessionParams(input()).customer_email).toBeUndefined();
  });

  it("lingua della sessione: it o en", () => {
    expect(buildCheckoutSessionParams(input({ locale: "en" })).locale).toBe("en");
    expect(buildCheckoutSessionParams(input({ locale: "en" })).success_url).toContain("/en/carrello/esito");
  });
});
