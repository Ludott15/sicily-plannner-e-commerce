import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { dbPublic } from "@/server/db/public";
import type { UserTx } from "@/server/db/user";
import {
  activities,
  activityInterests,
  interests,
  itineraries,
  itineraryItems,
  places,
} from "@/server/db/schema";

// Letture pubbliche del catalogo: passano tutte da dbPublic (ruolo anon), quindi
// le attività inattive e gli itinerari non template non escono mai da qui.

const activityCardColumns = {
  id: activities.id,
  slug: activities.slug,
  title: activities.title,
  durationMin: activities.durationMin,
  priceFromEur: activities.priceFromEur,
  rating: activities.rating,
  placeName: places.name,
  placeSlug: places.slug,
};

export type ActivityCard = Awaited<ReturnType<typeof listActivities>>[number];

export const listInterests = cache(() =>
  dbPublic((tx) => tx.select().from(interests).orderBy(asc(interests.sort))),
);

async function tagsByActivity(tx: UserTx, ids: string[]) {
  if (ids.length === 0) return new Map<string, { key: string; strength: number }[]>();
  const rows = await tx
    .select({
      activityId: activityInterests.activityId,
      key: activityInterests.interestKey,
      strength: activityInterests.strength,
    })
    .from(activityInterests)
    .where(inArray(activityInterests.activityId, ids))
    .orderBy(desc(activityInterests.strength));

  const map = new Map<string, { key: string; strength: number }[]>();
  for (const row of rows) {
    const list = map.get(row.activityId) ?? [];
    list.push({ key: row.key, strength: row.strength });
    map.set(row.activityId, list);
  }
  return map;
}

export const listActivities = cache(() =>
  dbPublic(async (tx) => {
    const rows = await tx
      .select(activityCardColumns)
      .from(activities)
      .innerJoin(places, eq(places.id, activities.placeId))
      .orderBy(desc(activities.rating), asc(activities.title));
    const tags = await tagsByActivity(
      tx,
      rows.map((r) => r.id),
    );
    return rows.map((r) => ({ ...r, tags: tags.get(r.id) ?? [] }));
  }),
);

export const getActivity = cache((slug: string) =>
  dbPublic(async (tx) => {
    const [row] = await tx
      .select({
        ...activityCardColumns,
        description: activities.description,
        requiresCar: activities.requiresCar,
        accessible: activities.accessible,
        seasonMonths: activities.seasonMonths,
        placeProvince: places.province,
        placeLat: places.lat,
        placeLng: places.lng,
      })
      .from(activities)
      .innerJoin(places, eq(places.id, activities.placeId))
      .where(eq(activities.slug, slug));
    if (!row) return null;
    const tags = await tagsByActivity(tx, [row.id]);
    return { ...row, tags: tags.get(row.id) ?? [] };
  }),
);

export const getPlace = cache((slug: string) =>
  dbPublic(async (tx) => {
    const [place] = await tx.select().from(places).where(eq(places.slug, slug));
    if (!place) return null;
    const rows = await tx
      .select(activityCardColumns)
      .from(activities)
      .innerJoin(places, eq(places.id, activities.placeId))
      .where(eq(activities.placeId, place.id))
      .orderBy(desc(activities.rating), asc(activities.title));
    const tags = await tagsByActivity(
      tx,
      rows.map((r) => r.id),
    );
    return { ...place, activities: rows.map((r) => ({ ...r, tags: tags.get(r.id) ?? [] })) };
  }),
);

// Solo i template editoriali pubblicati (con slug).
export const listTemplates = cache(() =>
  dbPublic((tx) =>
    tx
      .select({ id: itineraries.id, slug: itineraries.slug, title: itineraries.title, days: itineraries.days })
      .from(itineraries)
      .where(and(eq(itineraries.isTemplate, true), isNotNull(itineraries.slug)))
      .orderBy(asc(itineraries.days), asc(itineraries.title)),
  ),
);

export const getTemplate = cache((slug: string) =>
  dbPublic(async (tx) => {
    const [itinerary] = await tx
      .select({ id: itineraries.id, slug: itineraries.slug, title: itineraries.title, days: itineraries.days })
      .from(itineraries)
      .where(and(eq(itineraries.slug, slug), eq(itineraries.isTemplate, true)));
    if (!itinerary) return null;

    const items = await tx
      .select({
        id: itineraryItems.id,
        dayIndex: itineraryItems.dayIndex,
        position: itineraryItems.position,
        startTime: itineraryItems.startTime,
        customTitle: itineraryItems.customTitle,
        notes: itineraryItems.notes,
        activitySlug: activities.slug,
        activityTitle: activities.title,
        activityDurationMin: activities.durationMin,
        placeSlug: places.slug,
        placeName: places.name,
      })
      .from(itineraryItems)
      .leftJoin(activities, eq(activities.id, itineraryItems.activityId))
      // Una voce può avere un'attività oppure solo un luogo.
      .leftJoin(places, eq(places.id, sql`coalesce(${itineraryItems.placeId}, ${activities.placeId})`))
      .where(eq(itineraryItems.itineraryId, itinerary.id))
      .orderBy(asc(itineraryItems.dayIndex), asc(itineraryItems.position));

    return { ...itinerary, items };
  }),
);

// Per la sitemap: solo contenuti pubblici.
export const listPublicSlugs = cache(() =>
  dbPublic(async (tx) => {
    // In sequenza: le query di una transazione condividono la stessa connessione.
    const activityRows = await tx.select({ slug: activities.slug }).from(activities);
    const placeRows = await tx.select({ slug: places.slug }).from(places);
    const templateRows = await tx
      .select({ slug: itineraries.slug })
      .from(itineraries)
      .where(and(eq(itineraries.isTemplate, true), isNotNull(itineraries.slug)));
    return {
      activities: activityRows.map((r) => r.slug),
      places: placeRows.map((r) => r.slug),
      itineraries: templateRows.flatMap((r) => (r.slug ? [r.slug] : [])),
    };
  }),
);
