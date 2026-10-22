import type Stripe from "stripe";
import { z } from "zod";

// Dati di una sessione Stripe Checkout che servono all'ordine (passo 7.3). Funzione pura: legge l'oggetto
// della sessione e restituisce solo i campi che l'ordine usa. Nella versione dell'API fissata
// (checkout-gateway.ts) l'indirizzo di spedizione è in collected_information.shipping_details, il telefono
// e l'email in customer_details.

export type SessionShippingAddress = {
  name: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  province: string | null;
  country: string;
  phone: string | null;
};

export type PaidSessionFacts = {
  sessionId: string;
  // checkout_id dai metadati: senza, la sessione non si può collegare a uno snapshot.
  checkoutId: string | null;
  paymentStatus: string;
  paymentIntentId: string | null;
  amountTotalCents: number | null;
  currency: string | null;
  email: string | null;
  locale: "it" | "en";
  // Null se Stripe non ha raccolto un indirizzo completo.
  shippingAddress: SessionShippingAddress | null;
};

const checkoutIdSchema = z.uuid();

function text(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function readSessionFacts(session: Stripe.Checkout.Session): PaidSessionFacts {
  const parsedCheckout = checkoutIdSchema.safeParse(session.metadata?.checkout_id);
  const details = session.customer_details;
  const shipping = session.collected_information?.shipping_details ?? null;

  const paymentIntent = session.payment_intent;
  const paymentIntentId =
    typeof paymentIntent === "string" ? paymentIntent : paymentIntent ? paymentIntent.id : null;

  const address = shipping?.address ?? null;
  const line1 = text(address?.line1);
  const postalCode = text(address?.postal_code);
  const city = text(address?.city);
  const country = text(address?.country);

  return {
    sessionId: session.id,
    checkoutId: parsedCheckout.success ? parsedCheckout.data : null,
    paymentStatus: session.payment_status,
    paymentIntentId,
    amountTotalCents: typeof session.amount_total === "number" ? session.amount_total : null,
    currency: text(session.currency),
    email: text(details?.email),
    locale: session.locale?.toLowerCase().startsWith("en") ? "en" : "it",
    shippingAddress:
      line1 && postalCode && city && country
        ? {
            name: text(shipping?.name) ?? text(details?.name),
            line1,
            line2: text(address?.line2),
            postalCode,
            city,
            province: text(address?.state),
            country,
            phone: text(details?.phone),
          }
        : null,
  };
}
