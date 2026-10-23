import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { handleStripeEvent } from "@/server/shop/stripe-webhook.admin";
import { livemodeMatches, webhookSecret } from "@/server/shop/checkout-env";
import { verifyWebhook } from "@/server/shop/checkout-gateway";

// Webhook di Stripe (passo 7.2). Il corpo si legge grezzo: la firma si verifica sul testo esatto.
// Firma non valida: 400, Stripe non riprova. Errore di elaborazione: 500, Stripe riprova (la transazione
// è annullata, quindi il tentativo successivo elabora l'evento da capo).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const secret = webhookSecret();
  if (!secret) return NextResponse.json({ error: "webhook_not_configured" }, { status: 500 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = verifyWebhook(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  // Un evento in modalità diversa dalla chiave configurata (sk_live_ contro sk_test_) non si elabora.
  if (!livemodeMatches(event.livemode)) {
    console.error("stripe_webhook_livemode_mismatch", { type: event.type });
    return NextResponse.json({ error: "livemode_mismatch" }, { status: 400 });
  }

  try {
    const outcome = await handleStripeEvent(event);
    return NextResponse.json({ received: true, outcome }, { status: 200 });
  } catch {
    console.error("stripe_webhook_failed", { type: event.type });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
