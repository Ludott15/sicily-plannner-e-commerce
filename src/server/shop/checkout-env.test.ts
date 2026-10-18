import { describe, expect, it } from "vitest";
import {
  FAKE_WEBHOOK_SECRET,
  cartSecret,
  checkoutMode,
  fakeProviderActive,
  stripeSecretKey,
  webhookSecret,
} from "./checkout-env";

describe("modalità del checkout", () => {
  it("con la chiave Stripe: stripe; senza nulla: off", () => {
    expect(checkoutMode({ STRIPE_SECRET_KEY: "sk_test_x" })).toBe("stripe");
    expect(checkoutMode({})).toBe("off");
    expect(checkoutMode({ STRIPE_SECRET_KEY: "   " })).toBe("off");
    expect(stripeSecretKey({ STRIPE_SECRET_KEY: " sk_test_x " })).toBe("sk_test_x");
  });

  it("il provider finto è attivo solo fuori da Vercel, e vince sulla chiave", () => {
    expect(checkoutMode({ CHECKOUT_TEST_PROVIDER: "fake" })).toBe("fake");
    expect(checkoutMode({ CHECKOUT_TEST_PROVIDER: "fake", STRIPE_SECRET_KEY: "sk_test_x" })).toBe("fake");
    expect(checkoutMode({ CHECKOUT_TEST_PROVIDER: "fake", VERCEL_ENV: "preview" })).toBe("off");
    expect(
      checkoutMode({ CHECKOUT_TEST_PROVIDER: "fake", VERCEL_ENV: "production", STRIPE_SECRET_KEY: "sk_live_x" }),
    ).toBe("stripe");
    expect(fakeProviderActive({ CHECKOUT_TEST_PROVIDER: "fake", VERCEL_ENV: "production" })).toBe(false);
  });
});

describe("segreto del webhook", () => {
  it("quello configurato, altrimenti quello di prova solo con il provider finto", () => {
    expect(webhookSecret({ STRIPE_WEBHOOK_SECRET: "whsec_real" })).toBe("whsec_real");
    expect(webhookSecret({ CHECKOUT_TEST_PROVIDER: "fake" })).toBe(FAKE_WEBHOOK_SECRET);
    expect(webhookSecret({ STRIPE_SECRET_KEY: "sk_test_x" })).toBeNull();
    expect(webhookSecret({ CHECKOUT_TEST_PROVIDER: "fake", VERCEL_ENV: "production" })).toBeNull();
  });
});

describe("segreto del carrello", () => {
  it("fuori produzione c'è una chiave di sviluppo; in produzione senza CART_SECRET il carrello è spento", () => {
    expect(cartSecret({})).toEqual(expect.any(String));
    expect(cartSecret({ CART_SECRET: "abc" })).toBe("abc");
    expect(cartSecret({ VERCEL_ENV: "production" })).toBeNull();
    expect(cartSecret({ NODE_ENV: "production" })).toBeNull();
    expect(cartSecret({ VERCEL_ENV: "production", CART_SECRET: "abc" })).toBe("abc");
  });
});
