import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { expectedPaidCents } from "@/lib/shop/orders";
import { dbAdmin } from "@/server/db/admin";
import { checkoutSessions } from "@/server/db/schema";
import { checkoutMode, webhookSecret } from "@/server/shop/checkout-env";
import { STRIPE_API_VERSION, fakeSessionId, verifyWebhook } from "@/server/shop/checkout-gateway";
import { handleStripeEvent } from "@/server/shop/stripe-webhook.admin";

// Pagamento simulato di una sessione del provider finto (e2e e sviluppo, passo 7.3). Costruisce un evento
// checkout.session.completed con l'importo dello snapshot del checkout, lo firma con il segreto di prova e lo
// passa dalla stessa verifica della firma e dallo stesso gestore del webhook reale: crea l'ordine. Esiste solo
// con CHECKOUT_TEST_PROVIDER=fake senza VERCEL_ENV (altrove risponde 404). I dati di cliente sono di prova.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  checkoutId: z.uuid(),
  email: z.email().max(254).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  // Solo modalità finta e mai con NODE_ENV production (anche se CI=true lascia attivo il provider finto).
  if (checkoutMode() !== "fake" || process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });

  const secret = webhookSecret();
  if (!secret) return NextResponse.json({ error: "webhook_not_configured" }, { status: 500 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { checkoutId } = parsed.data;
  const email = parsed.data.email ?? "prova@example.com";

  const [checkout] = await dbAdmin
    .select({
      subtotalCents: checkoutSessions.subtotalCents,
      shippingCents: checkoutSessions.shippingCents,
      discountCents: checkoutSessions.discountCents,
    })
    .from(checkoutSessions)
    .where(eq(checkoutSessions.id, checkoutId))
    .limit(1);
  if (!checkout) return new NextResponse(null, { status: 404 });

  const amountTotal = expectedPaidCents({
    subtotalCents: checkout.subtotalCents,
    discountCents: checkout.discountCents,
    shippingCents: checkout.shippingCents,
  });

  try {
    const payload = JSON.stringify({
      id: `evt_fake_${randomUUID()}`,
      object: "event",
      api_version: STRIPE_API_VERSION,
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "checkout.session.completed",
      data: {
        object: {
          id: fakeSessionId(checkoutId),
          object: "checkout.session",
          metadata: { checkout_id: checkoutId },
          client_reference_id: checkoutId,
          payment_status: "paid",
          payment_intent: `pi_fake_${checkoutId.replace(/-/g, "")}`,
          amount_total: amountTotal,
          currency: "eur",
          locale: "it",
          customer_details: { email, name: "Prova Isula", phone: "+390000000000" },
          collected_information: {
            shipping_details: {
              name: "Prova Isula",
              address: {
                line1: "Via di prova 1",
                line2: null,
                city: "Palermo",
                state: "PA",
                postal_code: "90100",
                country: "IT",
              },
            },
          },
        },
      },
    });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const event = verifyWebhook(payload, header, secret);
    const outcome = await handleStripeEvent(event);
    return NextResponse.json({ received: true, outcome }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
