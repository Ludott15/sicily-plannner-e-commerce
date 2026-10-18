import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { checkoutMode, webhookSecret } from "@/server/shop/checkout-env";
import { STRIPE_API_VERSION, fakeSessionId, verifyWebhook } from "@/server/shop/checkout-gateway";
import { handleStripeEvent } from "@/server/shop/stripe-webhook.admin";

// Scadenza simulata di una sessione del provider finto (e2e e sviluppo). Esiste solo con
// CHECKOUT_TEST_PROVIDER=fake e senza VERCEL_ENV: altrove risponde 404. Costruisce un evento
// checkout.session.expired, lo firma con il segreto di prova e lo passa dalla stessa verifica della firma
// e dallo stesso gestore del webhook reale.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ checkoutId: z.uuid() });

export async function POST(request: Request): Promise<NextResponse> {
  if (checkoutMode() !== "fake") return new NextResponse(null, { status: 404 });

  const secret = webhookSecret();
  if (!secret) return NextResponse.json({ error: "webhook_not_configured" }, { status: 500 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { checkoutId } = parsed.data;

  try {
    const payload = JSON.stringify({
      id: `evt_fake_${randomUUID()}`,
      object: "event",
      api_version: STRIPE_API_VERSION,
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "checkout.session.expired",
      data: {
        object: {
          id: fakeSessionId(checkoutId),
          object: "checkout.session",
          metadata: { checkout_id: checkoutId },
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
