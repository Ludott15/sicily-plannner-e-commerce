import "server-only";
import { eq, sql } from "drizzle-orm";
import type { User } from "@supabase/supabase-js";
import { activities, activityOffers } from "@/server/db/schema";
import { dbPublic } from "@/server/db/public";
import { dbAsUser, type UserTx } from "@/server/db/user";
import { newSubid } from "./links";

// Logica di /api/go/[id] (anticipo minimo della milestone 6): genera il subid e chiama
// record_affiliate_click, che verifica l'offerta, costruisce l'URL del partner dal catalogo,
// registra il click e lo restituisce. affiliate_url non è leggibile dal client: l'URL esce
// solo da qui, e nessun parametro della richiesta lo cambia.

export type ClickContext = "page" | "itinerary" | "chat" | "flights";

export type GoResult =
  | { kind: "redirect"; url: string }
  | { kind: "unavailable"; slug: string | null };

export async function resolveAffiliateClick(input: {
  offerId: string;
  context: ClickContext;
  itineraryId: string | null;
  anonId: string | null;
  user: User | null;
}): Promise<GoResult> {
  const run = <T>(fn: (tx: UserTx) => Promise<T>) => (input.user ? dbAsUser(input.user, fn) : dbPublic(fn));

  const [offer] = await run((tx) =>
    tx
      .select({ slug: activities.slug })
      .from(activityOffers)
      .innerJoin(activities, eq(activities.id, activityOffers.activityId))
      .where(eq(activityOffers.id, input.offerId)),
  );
  // Offerte e attività inattive non sono visibili a chi naviga (RLS): arrivano qui come
  // "non trovate", e si torna al catalogo.
  if (!offer) return { kind: "unavailable", slug: null };

  try {
    const [row] = await run((tx) =>
      tx.execute<{ url: string }>(
        sql`select public.record_affiliate_click(${input.offerId}, ${newSubid()}, ${input.context}, ${input.user ? null : input.anonId}, ${input.itineraryId}) as url`,
      ),
    );
    if (!row?.url) return { kind: "unavailable", slug: offer.slug };
    return { kind: "redirect", url: row.url };
  } catch {
    return { kind: "unavailable", slug: offer.slug };
  }
}
