import "server-only";
import type Stripe from "stripe";
import { SHIPPING_COUNTRIES } from "@/lib/shop/config";
import type { Locale } from "@/lib/i18n/routing";

// Parametri della sessione Stripe Checkout (passo 7.2). Funzione pura: importi, righe e spedizione
// arrivano già calcolati dal server dal database (mai dal client). Il segnaposto {CHECKOUT_SESSION_ID}
// nell'URL di successo è quello di Stripe e va lasciato così com'è.

export type CheckoutSessionLine = {
  productId: string;
  title: string;
  unitPriceCents: number;
  quantity: number;
};

export type CheckoutSessionInput = {
  checkoutId: string;
  locale: Locale;
  lines: readonly CheckoutSessionLine[];
  shippingCents: number;
  couponId: string | null;
  customerEmail: string | null;
  siteUrl: string;
  expiresAtSeconds: number;
};

export function buildCheckoutSessionParams(input: CheckoutSessionInput): Stripe.Checkout.SessionCreateParams {
  const it = input.locale === "it";
  const base = input.siteUrl.replace(/\/$/, "");
  const terms = `${base}/${input.locale}/condizioni-di-vendita`;
  const shippingName = input.shippingCents === 0 ? (it ? "Spedizione gratuita" : "Free shipping") : it ? "Spedizione" : "Shipping";

  return {
    mode: "payment",
    client_reference_id: input.checkoutId,
    line_items: input.lines.map((line) => ({
      quantity: line.quantity,
      price_data: {
        currency: "eur",
        unit_amount: line.unitPriceCents,
        tax_behavior: "inclusive",
        product_data: { name: line.title, metadata: { product_id: line.productId } },
      },
    })),
    discounts: input.couponId ? [{ coupon: input.couponId }] : undefined,
    shipping_address_collection: { allowed_countries: [...SHIPPING_COUNTRIES] },
    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          display_name: shippingName,
          fixed_amount: { amount: input.shippingCents, currency: "eur" },
          tax_behavior: "inclusive",
        },
      },
    ],
    phone_number_collection: { enabled: true },
    customer_email: input.customerEmail ?? undefined,
    locale: input.locale,
    success_url: `${base}/${input.locale}/carrello/esito?sessione={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/${input.locale}/carrello?annullato=1`,
    expires_at: input.expiresAtSeconds,
    metadata: { checkout_id: input.checkoutId },
    payment_intent_data: { metadata: { checkout_id: input.checkoutId } },
    consent_collection: { terms_of_service: "required" },
    custom_text: {
      terms_of_service_acceptance: {
        message: it ? `Accetto le [condizioni di vendita](${terms}).` : `I accept the [terms of sale](${terms}).`,
      },
    },
  };
}
