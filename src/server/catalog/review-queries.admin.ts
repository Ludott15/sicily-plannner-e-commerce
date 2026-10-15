import "server-only";
import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { activities, activityInterests, activityTagProposals, areas, interests, places } from "@/server/db/schema";

// Coda "Da verificare" dell'admin: attività con needs_review = true (tutte quelle arrivate
// dall'import o modificate senza verifica). Ogni funzione verifica l'admin prima di leggere.

export type ReviewMissing = "tags" | "coordinates" | "area" | "photo";
export type ReviewQueueFilter = { areaSlug: string | null; missing: ReviewMissing | null };
// Tag proposti dall'import (activity_tag_proposals), in attesa di "Conferma tag".
export type ProposedTag = { key: string; labelIt: string; strength: number };
export type ReviewQueueItem = {
  id: string;
  slug: string;
  title: string;
  isActive: boolean;
  placeId: string;
  placeName: string;
  placeIsActive: boolean;
  placeNeedsReview: boolean;
  areaSlug: string | null;
  areaName: string | null;
  tagCount: number;
  hasCover: boolean;
  missing: ReviewMissing[];
  proposedTags: ProposedTag[];
};

// Una query per le attività (join con luoghi e aree, conteggio dei tag in sottoquery, filtri in
// SQL) e una per le proposte di tag delle sole attività in lista.
export async function adminListReviewQueue(filter: ReviewQueueFilter): Promise<ReviewQueueItem[]> {
  await requireAdmin();
  const tagCount = sql<number>`(select count(*)::int from ${activityInterests} ai where ai.activity_id = ${activities.id})`;

  const missingCondition: Record<ReviewMissing, SQL> = {
    tags: sql`${tagCount} = 0`,
    coordinates: eq(places.needsReview, true),
    area: isNull(places.areaId),
    photo: isNull(activities.coverMediaId),
  };
  const conditions: SQL[] = [eq(activities.needsReview, true)];
  if (filter.areaSlug) conditions.push(eq(areas.slug, filter.areaSlug));
  if (filter.missing) conditions.push(missingCondition[filter.missing]);

  const rows = await dbAdmin
    .select({
      id: activities.id,
      slug: activities.slug,
      title: activities.title,
      isActive: activities.isActive,
      placeId: places.id,
      placeName: places.name,
      placeIsActive: places.isActive,
      placeNeedsReview: places.needsReview,
      areaSlug: areas.slug,
      areaName: areas.nameIt,
      tagCount,
      hasCover: sql<boolean>`${activities.coverMediaId} is not null`,
    })
    .from(activities)
    .innerJoin(places, eq(places.id, activities.placeId))
    .leftJoin(areas, eq(areas.id, places.areaId))
    .where(and(...conditions))
    .orderBy(sql`${areas.sort} asc nulls last`, asc(areas.slug), asc(activities.title));

  const proposals = await proposedTagsFor(rows.map((row) => row.id));

  return rows.map((row) => {
    const missing: ReviewMissing[] = [];
    if (row.tagCount === 0) missing.push("tags");
    if (row.placeNeedsReview) missing.push("coordinates");
    if (row.areaSlug === null) missing.push("area");
    if (!row.hasCover) missing.push("photo");
    return { ...row, missing, proposedTags: proposals.get(row.id) ?? [] };
  });
}

// Proposte di tag per un insieme di attività: una query, raggruppate per attività.
async function proposedTagsFor(activityIds: readonly string[]): Promise<Map<string, ProposedTag[]>> {
  const byActivity = new Map<string, ProposedTag[]>();
  if (activityIds.length === 0) return byActivity;
  const rows = await dbAdmin
    .select({
      activityId: activityTagProposals.activityId,
      key: activityTagProposals.interestKey,
      labelIt: interests.labelIt,
      strength: activityTagProposals.strength,
    })
    .from(activityTagProposals)
    .innerJoin(interests, eq(interests.key, activityTagProposals.interestKey))
    .where(inArray(activityTagProposals.activityId, [...activityIds]))
    .orderBy(asc(interests.sort), asc(interests.key));
  for (const row of rows) {
    const list = byActivity.get(row.activityId) ?? [];
    list.push({ key: row.key, labelIt: row.labelIt, strength: row.strength });
    byActivity.set(row.activityId, list);
  }
  return byActivity;
}

// Opzioni del filtro per area: nome italiano, nell'ordine editoriale.
export async function adminListAreaOptions(): Promise<{ slug: string; name: string }[]> {
  await requireAdmin();
  return dbAdmin
    .select({ slug: areas.slug, name: areas.nameIt })
    .from(areas)
    .orderBy(asc(areas.sort), asc(areas.nameIt));
}
