import "server-only";
import Stripe from "stripe";
import { buildCheckoutSessionParams, type CheckoutSessionInput } from "./checkout-params";

// Chiamate al fornitore di pagamento (passo 7.2). Due implementazioni con la stessa interfaccia:
// Stripe (modalità "stripe") e il provider finto per e2e e sviluppo (modalità "fake").

// Versione dell'API fissata: la stessa del pacchetto stripe 21.0.1 installato.
export const STRIPE_API_VERSION = "2026-03-25.dahlia";

export type CheckoutGateway = {
  // Coupon monouso (un solo utilizzo) con l'importo dei punti. Restituisce l'id del coupon.
  createCoupon(input: { checkoutId: string; amountOffCents: number }): Promise<string>;
  // Sessione di pagamento. Restituisce id e URL a cui mandare il cliente.
  createSession(input: CheckoutSessionInput): Promise<{ id: string; url: string }>;
  // Annulla una sessione aperta (best effort dal server, quando il collegamento alla riga non è riuscito).
  expireSession(stripeSessionId: string): Promise<void>;
};

export function stripeGateway(secretKey: string): CheckoutGateway {
  const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, timeout: 10_000 });
  return {
    async createCoupon({ checkoutId, amountOffCents }) {
      const coupon = await stripe.coupons.create(
        {
          amount_off: amountOffCents,
          currency: "eur",
          duration: "once",
          max_redemptions: 1,
          name: "Punti Isula",
          metadata: { checkout_id: checkoutId },
        },
        { idempotencyKey: `coupon-${checkoutId}` },
      );
      return coupon.id;
    },
    async createSession(input) {
      const session = await stripe.checkout.sessions.create(buildCheckoutSessionParams(input), {
        idempotencyKey: `session-${input.checkoutId}`,
      });
      if (!session.url) throw new Error("stripe_session_without_url");
      return { id: session.id, url: session.url };
    },
    async expireSession(stripeSessionId) {
      await stripe.checkout.sessions.expire(stripeSessionId);
    },
  };
}

// Provider finto: nessuna chiamata di rete. La sessione punta a una pagina locale di prova.
export function fakeGateway(): CheckoutGateway {
  return {
    async createCoupon({ checkoutId }) {
      return `fake_coupon_${checkoutId}`;
    },
    async expireSession() {
      // Nessuna sessione reale da annullare: la scadenza simulata passa dall'endpoint di test.
    },
    async createSession({ checkoutId, locale, siteUrl }) {
      const id = fakeSessionId(checkoutId);
      const base = siteUrl.replace(/\/$/, "");
      return { id, url: `${base}/${locale}/carrello/prova-pagamento?sessione=${id}` };
    },
  };
}

export function fakeSessionId(checkoutId: string): string {
  return `cs_fake_${checkoutId.replace(/-/g, "")}`;
}

// Verifica la firma del webhook e restituisce l'evento. Lancia un errore se la firma non è valida
// o se il messaggio è troppo vecchio (tolleranza di 5 minuti del pacchetto stripe).
export function verifyWebhook(payload: string, signature: string, secret: string): Stripe.Event {
  return Stripe.webhooks.constructEvent(payload, signature, secret);
}
