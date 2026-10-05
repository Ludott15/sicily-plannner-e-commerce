import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { dbPublic } from "@/server/db/public";

// Consigli locali pubblici: sempre dalla vista public_local_tips (attivi, verificati negli
// ultimi 12 mesi, solo i campi pubblici dell'autore). Il luogo mostrato è quello del consiglio
// o, per un consiglio su un'attività, il luogo dell'attività.

export type PublicTip = {
  id: string;
  activityId: string | null;
  placeId: string | null;
  body: string;
  authorRelation: string | null;
  verifiedAt: string;
  authorKind: "editorial" | "person";
  authorName: string;
  authorPhotoUrl: string | null;
  placeName: string | null;
};

const tipColumns = sql`
  t.id, t.activity_id as "activityId", coalesce(t.place_id, a.place_id) as "placeId", t.body,
  t.author_relation as "authorRelation", t.verified_at::text as "verifiedAt",
  t.author_kind::text as "authorKind", t.author_name as "authorName",
  t.author_photo_url as "authorPhotoUrl", p.name as "placeName"
  from public.public_local_tips t
  left join public.activities a on a.id = t.activity_id
  left join public.places p on p.id = coalesce(t.place_id, a.place_id)`;

// Consigli delle attività e dei luoghi indicati, dal più recente.
export const listTipsFor = cache(async (activityIds: readonly string[], placeIds: readonly string[]) => {
  if (activityIds.length === 0 && placeIds.length === 0) return [];
  const activities = sql.join(activityIds.length ? activityIds.map((id) => sql`${id}::uuid`) : [sql`null`], sql`, `);
  const places = sql.join(placeIds.length ? placeIds.map((id) => sql`${id}::uuid`) : [sql`null`], sql`, `);
  return dbPublic((tx) =>
    tx.execute<PublicTip>(sql`
      select ${tipColumns}
      where t.activity_id in (${activities}) or t.place_id in (${places})
      order by t.verified_at desc, t.id`),
  );
});

// Il consiglio di un'attività: il suo, altrimenti quello del suo luogo.
export async function getActivityTip(activityId: string, placeId: string): Promise<PublicTip | null> {
  const tips = await listTipsFor([activityId], [placeId]);
  return tips.find((t) => t.activityId === activityId) ?? tips[0] ?? null;
}

// Fascia "La voce locale" della home: i consigli verificati più di recente.
export const listLatestTips = cache((limit = 3) =>
  dbPublic((tx) =>
    tx.execute<PublicTip>(sql`select ${tipColumns} order by t.verified_at desc, t.id limit ${limit}`),
  ),
);
