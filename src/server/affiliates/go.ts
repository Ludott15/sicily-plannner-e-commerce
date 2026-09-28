import "server-only";
import { eq, sql } from "drizzle-orm";
import type { User } from "@supabase/supabase-js";
import { activities } from "@/server/db/schema";
import { dbPublic } from "@/server/db/public";
import { dbAsUser, type UserTx } from "@/server/db/user";
import { buildAffiliateUrl, newSubid, type Partner } from "./links";

// Logica di /api/go/[id] (anticipo minimo della milestone 6): risolve l'attività, genera
// il subid, registra il click con record_affiliate_click e restituisce l'URL del partner.
// L'URL di destinazione viene solo dal catalogo: nessun parametro della richiesta lo cambia.

export type ClickContext = "page" | "itinerary" | "chat" | "flights";

export type GoResult =
  | { kind: "redirect"; url: string }
  | { kind: "unavailable"; slug: string | null };

export async function resolveAffiliateClick(input: {
  activityId: string;
  context: ClickContext;
  itineraryId: string | null;
  anonId: string;
  user: User | null;
}): Promise<GoResult> {
  const run = <T>(fn: (tx: UserTx) => Promise<T>) => (input.user ? dbAsUser(input.user, fn) : dbPublic(fn));

  const [activity] = await run((tx) =>
    tx
      .select({ slug: activities.slug, partner: activities.partner, affiliateUrl: activities.affiliateUrl })
      .from(activities)
      .where(eq(activities.id, input.activityId)),
  );
  // Le attività inattive non sono visibili a chi naviga: arrivano qui come "non trovate".
  if (!activity?.affiliateUrl) return { kind: "unavailable", slug: activity?.slug ?? null };

  const subid = newSubid();
  const url = buildAffiliateUrl(activity.affiliateUrl, activity.partner as Partner, subid);

  try {
    await run((tx) =>
      tx.execute(
        sql`select public.record_affiliate_click(${input.activityId}, ${subid}, ${url}, ${input.context}, ${input.user ? null : input.anonId}, ${input.itineraryId})`,
      ),
    );
  } catch {
    return { kind: "unavailable", slug: activity.slug };
  }
  return { kind: "redirect", url };
}
