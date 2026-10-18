import "server-only";

// Configurazione dei pagamenti (passo 7.2), letta solo qui. Le funzioni ricevono l'ambiente come
// parametro, così i test non toccano process.env.
//
// - STRIPE_SECRET_KEY: accende Stripe Checkout (modalità "stripe").
// - CHECKOUT_TEST_PROVIDER=fake: provider finto per e2e e sviluppo. Attivo solo se VERCEL_ENV è assente:
//   la sessione punta a una pagina locale di prova, e la scadenza si simula con un endpoint di test.
// - Senza nessuno dei due, la modalità è "off": il carrello funziona, il pagamento resta in sospeso.
// - STRIPE_WEBHOOK_SECRET: firma del webhook. Con il provider finto, senza questa variabile, si usa un
//   segreto di prova costante (mai valido fuori dal provider finto).
// - CART_SECRET: chiave HMAC del cookie del carrello. Senza, fuori da produzione si usa una chiave di
//   sviluppo costante; in produzione (VERCEL_ENV=production o NODE_ENV=production) il carrello è spento.

export type CheckoutMode = "stripe" | "fake" | "off";

export type Env = Readonly<Record<string, string | undefined>>;

export const FAKE_WEBHOOK_SECRET = "whsec_fake_checkout_test_only";
const DEV_CART_SECRET = "isula-dev-cart-secret-not-for-production";

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function fakeProviderActive(env: Env = process.env): boolean {
  return read(env, "CHECKOUT_TEST_PROVIDER") === "fake" && read(env, "VERCEL_ENV") === undefined;
}

export function checkoutMode(env: Env = process.env): CheckoutMode {
  if (fakeProviderActive(env)) return "fake";
  return read(env, "STRIPE_SECRET_KEY") ? "stripe" : "off";
}

// Chiave segreta di Stripe (solo modalità "stripe").
export function stripeSecretKey(env: Env = process.env): string | null {
  return read(env, "STRIPE_SECRET_KEY") ?? null;
}

// Segreto per verificare la firma del webhook. Null: il webhook risponde errore di configurazione.
export function webhookSecret(env: Env = process.env): string | null {
  const configured = read(env, "STRIPE_WEBHOOK_SECRET");
  if (configured) return configured;
  return fakeProviderActive(env) ? FAKE_WEBHOOK_SECRET : null;
}

function productionLike(env: Env): boolean {
  return read(env, "VERCEL_ENV") === "production" || read(env, "NODE_ENV") === "production";
}

// Chiave HMAC del carrello. Null in produzione senza CART_SECRET: il carrello risponde "unavailable".
export function cartSecret(env: Env = process.env): string | null {
  const configured = read(env, "CART_SECRET");
  if (configured) return configured;
  return productionLike(env) ? null : DEV_CART_SECRET;
}
