import "server-only";
import { sql } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod";
import { dbAdmin } from "@/server/db/admin";
import { stripeEvents } from "@/server/db/schema";
import { runOrderEffects } from "./order-effects.admin";
import {
  recordAsyncPaymentFailed,
  recordAsyncPaymentSucceeded,
  recordCompletedSession,
  type OrderEffect,
  type WebhookOrderResult,
} from "./orders-state.admin";

// Gestore degli eventi Stripe (passi 7.2 e 7.3). Usato solo da src/app/api/stripe/** (ruolo postgres, RLS
// esclusa). Ogni evento si elabora nella stessa transazione in cui si registra il suo id in stripe_events:
// un errore annulla entrambi, così Stripe riprova e un evento già elaborato non si ripete (idempotenza).
// Dopo il commit partono le email e l'inoltro al fornitore (runOrderEffects); un loro errore non annulla
// l'ordine.
//
// - checkout.session.completed: crea l'ordine (pagato, o in attesa se il pagamento è asincrono) e chiude la
//   riga del checkout. Importo o dati non coincidenti: needs_review, nessuna email né inoltro.
// - checkout.session.async_payment_succeeded: l'ordine in attesa diventa pagato.
// - checkout.session.async_payment_failed: l'ordine in attesa si annulla e i punti tornano una volta.
// - checkout.session.expired: chiude la sessione e restituisce i punti una volta sola (passo 7.2).

export type StripeEventOutcome =
  | "duplicate"
  | "expired"
  | "already_closed"
  | "ignored"
  | WebhookOrderResult["outcome"];

const checkoutIdSchema = z.uuid();

type HandledEvent = { outcome: StripeEventOutcome; effects: OrderEffect[] };

export async function handleStripeEvent(event: Stripe.Event): Promise<StripeEventOutcome> {
  const handled = await dbAdmin.transaction(async (tx): Promise<HandledEvent> => {
    const inserted = await tx
      .insert(stripeEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing({ target: stripeEvents.id })
      .returning({ id: stripeEvents.id });
    if (inserted.length === 0) return { outcome: "duplicate", effects: [] };

    switch (event.type) {
      case "checkout.session.completed": {
        return toHandled(await recordCompletedSession(tx, event.data.object));
      }
      case "checkout.session.async_payment_succeeded": {
        return toHandled(await recordAsyncPaymentSucceeded(tx, event.data.object));
      }
      case "checkout.session.async_payment_failed": {
        return toHandled(await recordAsyncPaymentFailed(tx, event.data.object));
      }
      case "checkout.session.expired": {
        const session = event.data.object;
        const parsedId = checkoutIdSchema.safeParse(session.metadata?.checkout_id);
        const checkoutId = parsedId.success ? parsedId.data : null;
        const rows = await tx.execute<{ closed: boolean }>(
          sql`select public.checkout_expire_from_stripe(${checkoutId}::uuid, ${session.id}::text) as closed`,
        );
        return { outcome: rows[0]?.closed === true ? "expired" : "already_closed", effects: [] };
      }
      default: {
        console.info("stripe_event_ignored", { type: event.type });
        return { outcome: "ignored", effects: [] };
      }
    }
  });

  await runOrderEffects(handled.effects);
  return handled.outcome;
}

function toHandled(result: WebhookOrderResult): HandledEvent {
  return { outcome: result.outcome, effects: result.effects };
}
