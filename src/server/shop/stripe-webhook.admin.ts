import "server-only";
import { sql } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod";
import { dbAdmin } from "@/server/db/admin";
import { stripeEvents } from "@/server/db/schema";

// Gestore degli eventi Stripe (passo 7.2). Usato solo da src/app/api/stripe/** (ruolo postgres, RLS
// esclusa). Ogni evento si elabora nella stessa transazione in cui si registra il suo id in
// stripe_events: un errore annulla entrambi, così Stripe riprova e un evento già elaborato non si
// ripete (idempotenza).
//
// In questo passo: checkout.session.expired chiude la sessione e restituisce i punti una volta sola.
// checkout.session.completed si registra e si ignora: l'ordine lo crea il passo 7.3.

export type StripeEventOutcome = "duplicate" | "expired" | "already_closed" | "ignored";

const checkoutIdSchema = z.uuid();

export async function handleStripeEvent(event: Stripe.Event): Promise<StripeEventOutcome> {
  return dbAdmin.transaction(async (tx) => {
    const inserted = await tx
      .insert(stripeEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing({ target: stripeEvents.id })
      .returning({ id: stripeEvents.id });
    if (inserted.length === 0) return "duplicate";

    switch (event.type) {
      case "checkout.session.expired": {
        const session = event.data.object;
        const parsedId = checkoutIdSchema.safeParse(session.metadata?.checkout_id);
        const checkoutId = parsedId.success ? parsedId.data : null;
        const rows = await tx.execute<{ closed: boolean }>(
          sql`select public.checkout_expire_from_stripe(${checkoutId}::uuid, ${session.id}::text) as closed`,
        );
        return rows[0]?.closed === true ? "expired" : "already_closed";
      }
      case "checkout.session.completed": {
        console.info("stripe_event_recorded_not_handled", { type: event.type });
        return "ignored";
      }
      default: {
        console.info("stripe_event_ignored", { type: event.type });
        return "ignored";
      }
    }
  });
}
