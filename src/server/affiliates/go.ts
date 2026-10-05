import "server-only";
import { eq, sql } from "drizzle-orm";
import type { User } from "@supabase/supabase-js";
import { activities, activityOffers } from "@/server/db/schema";
import { dbPublic } from "@/server/db/public";
import { dbAsUser, type UserTx } from "@/server/db/user";
import { buildAffiliateUrl, newSubid, type Partner } from "./links";

// Logica di /api/go/[id] (anticipo minimo della milestone 6): risolve l'offerta del partner,
// genera il subid, registra il click con record_affiliate_click e restituisce l'URL del partner.
// L'URL di destinazione viene solo dal catalogo: nessun parametro della richiesta lo cambia.

export type ClickContext = "page" | "itinerary" | "chat" | "flights";

export type GoResult =
  | { kind: "redirect"; url: string }
  | { kind: "unavailable"; slug: string | null };

export async function resolveAffiliateClick(input: {
  offerId: string;
  context: ClickContext;
  itineraryId: string | null;
  anonId: string;
  user: User | null;
}): Promise<GoResult> {
  const run = <T>(fn: (tx: UserTx) => Promise<T>) => (input.user ? dbAsUser(input.user, fn) : dbPublic(fn));

  const [offer] = await run((tx) =>
    tx
      .select({ slug: activities.slug, partner: activityOffers.partner, affiliateUrl: activityOffers.affiliateUrl })
      .from(activityOffers)
      .innerJoin(activities, eq(activities.id, activityOffers.activityId))
      .where(eq(activityOffers.id, input.offerId)),
  );
  // Offerte e attività inattive non sono visibili a chi naviga (RLS): arrivano qui come
  // "non trovate", e si torna al catalogo.
  if (!offer) return { kind: "unavailable", slug: null };

  const subid = newSubid();
  const url = buildAffiliateUrl(offer.affiliateUrl, offer.partner as Partner, subid);

  try {
    await run((tx) =>
      tx.execute(
        sql`select public.record_affiliate_click(${input.offerId}, ${subid}, ${url}, ${input.context}, ${input.user ? null : input.anonId}, ${input.itineraryId})`,
      ),
    );
  } catch {
    return { kind: "unavailable", slug: offer.slug };
  }
  return { kind: "redirect", url };
}
