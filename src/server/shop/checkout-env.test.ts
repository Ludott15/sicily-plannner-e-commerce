import { describe, expect, it } from "vitest";
import {
  FAKE_WEBHOOK_SECRET,
  cartSecret,
  checkoutMode,
  fakeProviderActive,
  livemodeMatches,
  stripeSecretKey,
  webhookSecret,
} from "./checkout-env";

describe("modalità del checkout", () => {
  it("Stripe reale solo con la chiave e CHECKOUT_STRIPE_ENABLED=1; la sola chiave non basta", () => {
    expect(checkoutMode({ STRIPE_SECRET_KEY: "sk_test_x", CHECKOUT_STRIPE_ENABLED: "1" })).toBe("stripe");
    expect(checkoutMode({ STRIPE_SECRET_KEY: "sk_test_x" })).toBe("off");
    expect(checkoutMode({ STRIPE_SECRET_KEY: "sk_test_x", CHECKOUT_STRIPE_ENABLED: "0" })).toBe("off");
    expect(checkoutMode({ STRIPE_SECRET_KEY: "sk_test_x", CHECKOUT_STRIPE_ENABLED: "true" })).toBe("off");
    expect(checkoutMode({ CHECKOUT_STRIPE_ENABLED: "1" })).toBe("off");
    expect(checkoutMode({ STRIPE_SECRET_KEY: "   ", CHECKOUT_STRIPE_ENABLED: "1" })).toBe("off");
    expect(checkoutMode({})).toBe("off");
    expect(stripeSecretKey({ STRIPE_SECRET_KEY: " sk_test_x " })).toBe("sk_test_x");
  });

  it("il provider finto vince sulla chiave e vale fuori da Vercel", () => {
    expect(checkoutMode({ CHECKOUT_TEST_PROVIDER: "fake" })).toBe("fake");
    expect(checkoutMode({ CHECKOUT_TEST_PROVIDER: "fake", STRIPE_SECRET_KEY: "sk_test_x", CHECKOUT_STRIPE_ENABLED: "1" })).toBe("fake");
    expect(checkoutMode({ CHECKOUT_TEST_PROVIDER: "fake", VERCEL_ENV: "preview" })).toBe("off");
    expect(
      checkoutMode({ CHECKOUT_TEST_PROVIDER: "fake", VERCEL_ENV: "production", STRIPE_SECRET_KEY: "sk_live_x", CHECKOUT_STRIPE_ENABLED: "1" }),
    ).toBe("stripe");
  });

  it("provider finto: NODE_ENV production senza CI è escluso, con CI=true è ammesso", () => {
    expect(fakeProviderActive({ CHECKOUT_TEST_PROVIDER: "fake", NODE_ENV: "development" })).toBe(true);
    expect(fakeProviderActive({ CHECKOUT_TEST_PROVIDER: "fake", NODE_ENV: "test" })).toBe(true);
    expect(fakeProviderActive({ CHECKOUT_TEST_PROVIDER: "fake" })).toBe(true);
    expect(fakeProviderActive({ CHECKOUT_TEST_PROVIDER: "fake", NODE_ENV: "production" })).toBe(false);
    expect(fakeProviderActive({ CHECKOUT_TEST_PROVIDER: "fake", NODE_ENV: "production", CI: "true" })).toBe(true);
    expect(fakeProviderActive({ CHECKOUT_TEST_PROVIDER: "fake", NODE_ENV: "production", CI: "false" })).toBe(false);
    expect(fakeProviderActive({ CHECKOUT_TEST_PROVIDER: "fake", NODE_ENV: "production", CI: "true", VERCEL_ENV: "preview" })).toBe(false);
    expect(fakeProviderActive({ CHECKOUT_TEST_PROVIDER: "off", NODE_ENV: "development" })).toBe(false);
  });

  it("modalità live: l'evento deve coincidere con la chiave (sk_live_ ↔ live)", () => {
    expect(livemodeMatches(false, { STRIPE_SECRET_KEY: "sk_test_x" })).toBe(true);
    expect(livemodeMatches(true, { STRIPE_SECRET_KEY: "sk_test_x" })).toBe(false);
    expect(livemodeMatches(true, { STRIPE_SECRET_KEY: "sk_live_x" })).toBe(true);
    expect(livemodeMatches(false, { STRIPE_SECRET_KEY: "sk_live_x" })).toBe(false);
    expect(livemodeMatches(false, { CHECKOUT_TEST_PROVIDER: "fake" })).toBe(true);
    expect(livemodeMatches(true, {})).toBe(false);
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
