import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, exists, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { dbPublic } from "@/server/db/public";
import type { UserTx } from "@/server/db/user";
import {
  activities,
  activityInterests,
  activityOffers,
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
  onSitePriceEur: activities.onSitePriceEur,
  // Prezzo "da" dell'offerta più economica (null senza offerte): solo per il prezzo in
  // evidenza delle card, che c'è solo se l'attività è prenotabile (ActivityCard/README.md).
  offerPriceFromEur: sql<string | null>`(
    select min(o.price_from_eur) from public.activity_offers o
    where o.activity_id = ${activities.id} and o.is_active
  )`,
  rating: activities.rating,
  requiresCar: activities.requiresCar,
  placeName: places.name,
  placeSlug: places.slug,
  placeProvince: places.province,
  placeCoverImage: places.coverImage,
};

export type Tag = { key: string; strength: number };
export type CatalogActivity = Awaited<ReturnType<typeof listActivities>>[number];

export const listInterests = cache(() =>
  dbPublic((tx) => tx.select().from(interests).orderBy(asc(interests.sort))),
);

async function tagsByActivity(tx: UserTx, ids: string[]) {
  if (ids.length === 0) return new Map<string, Tag[]>();
  const rows = await tx
    .select({
      activityId: activityInterests.activityId,
      key: activityInterests.interestKey,
      strength: activityInterests.strength,
    })
    .from(activityInterests)
    .where(inArray(activityInterests.activityId, ids))
    .orderBy(desc(activityInterests.strength), asc(activityInterests.interestKey));

  const map = new Map<string, Tag[]>();
  for (const row of rows) {
    const list = map.get(row.activityId) ?? [];
    list.push({ key: row.key, strength: row.strength });
    map.set(row.activityId, list);
  }
  return map;
}

async function withTags<T extends { id: string }>(tx: UserTx, rows: T[]) {
  const tags = await tagsByActivity(
    tx,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({ ...r, tags: tags.get(r.id) ?? [] }));
}

// Filtri della lista attività: interessi (basta uno dei selezionati) e provincia.
// I valori arrivano dall'URL già validati (parseActivityFilters in src/lib/activity-filters.ts).

export const listActivities = cache((interestKeys: readonly string[] = [], province: string | null = null) =>
  dbPublic(async (tx) => {
    const rows = await tx
      .select(activityCardColumns)
      .from(activities)
      .innerJoin(places, eq(places.id, activities.placeId))
      .where(
        and(
          province ? eq(places.province, province) : undefined,
          interestKeys.length > 0
            ? exists(
                tx
                  .select({ one: sql`1` })
                  .from(activityInterests)
                  .where(
                    and(
                      eq(activityInterests.activityId, activities.id),
                      inArray(activityInterests.interestKey, [...interestKeys]),
                    ),
                  ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(activities.rating), asc(activities.title));
    return withTags(tx, rows);
  }),
);

// Valori possibili dei filtri: solo interessi e province con almeno un'attività visibile,
// così nessun filtro porta a una lista vuota da solo.
export const listActivityFilterOptions = cache(() =>
  dbPublic(async (tx) => {
    const [interestRows, provinceRows] = await Promise.all([
      tx
        .selectDistinct({ key: interests.key, sort: interests.sort })
        .from(interests)
        .innerJoin(activityInterests, eq(activityInterests.interestKey, interests.key))
        .innerJoin(activities, eq(activities.id, activityInterests.activityId))
        .orderBy(asc(interests.sort)),
      tx
        .selectDistinct({ province: places.province })
        .from(places)
        .innerJoin(activities, eq(activities.placeId, places.id))
        .orderBy(asc(places.province)),
    ]);
    return { interests: interestRows.map((r) => r.key), provinces: provinceRows.map((r) => r.province) };
  }),
);

export const getActivity = cache((slug: string) =>
  dbPublic(async (tx) => {
    const [row] = await tx
      .select({
        ...activityCardColumns,
        description: activities.description,
        accessible: activities.accessible,
        seasonMonths: activities.seasonMonths,
        placeId: activities.placeId,
        placeLat: places.lat,
        placeLng: places.lng,
      })
      .from(activities)
      .innerJoin(places, eq(places.id, activities.placeId))
      .where(eq(activities.slug, slug));
    if (!row) return null;
    const [withTag] = await withTags(tx, [row]);
    return withTag!;
  }),
);

// "Nella stessa giornata": altre attività nella stessa provincia, prima quelle dello stesso luogo.
export const listNearbyActivities = cache((activityId: string, placeId: string, province: string, limit = 4) =>
  dbPublic(async (tx) => {
    const rows = await tx
      .select(activityCardColumns)
      .from(activities)
      .innerJoin(places, eq(places.id, activities.placeId))
      .where(and(eq(places.province, province), ne(activities.id, activityId)))
      .orderBy(sql`${activities.placeId} = ${placeId} desc`, desc(activities.rating), asc(activities.title))
      .limit(limit);
    return withTags(tx, rows);
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
    return { ...place, activities: await withTags(tx, rows) };
  }),
);

// Itinerari pronti (template editoriali pubblicati) con i luoghi toccati, in ordine di visita.
async function templateSummaries(tx: UserTx, where = sql`true`) {
  const templates = await tx
    .select({ id: itineraries.id, slug: itineraries.slug, title: itineraries.title, days: itineraries.days })
    .from(itineraries)
    .where(and(eq(itineraries.isTemplate, true), isNotNull(itineraries.slug), where))
    .orderBy(asc(itineraries.days), asc(itineraries.title));
  if (templates.length === 0) return [];

  const stops = await tx
    .select({
      itineraryId: itineraryItems.itineraryId,
      placeName: places.name,
      placeCoverImage: places.coverImage,
      requiresCar: activities.requiresCar,
    })
    .from(itineraryItems)
    .leftJoin(activities, eq(activities.id, itineraryItems.activityId))
    .leftJoin(places, eq(places.id, sql`coalesce(${itineraryItems.placeId}, ${activities.placeId})`))
    .where(
      inArray(
        itineraryItems.itineraryId,
        templates.map((t) => t.id),
      ),
    )
    .orderBy(asc(itineraryItems.dayIndex), asc(itineraryItems.position));

  return templates.map((t) => {
    const own = stops.filter((s) => s.itineraryId === t.id);
    const placeNames = [...new Set(own.flatMap((s) => (s.placeName ? [s.placeName] : [])))];
    return {
      ...t,
      slug: t.slug!,
      placeNames,
      coverImage: own.find((s) => s.placeCoverImage)?.placeCoverImage ?? null,
      requiresCar: own.some((s) => s.requiresCar),
    };
  });
}

export type TemplateSummary = Awaited<ReturnType<typeof listTemplates>>[number];

export const listTemplates = cache(() => dbPublic((tx) => templateSummaries(tx)));

// Itinerari pronti che passano da un luogo.
export const listTemplatesThroughPlace = cache((placeId: string) =>
  dbPublic((tx) =>
    templateSummaries(
      tx,
      sql`${itineraries.id} in (
        select ii.itinerary_id from public.itinerary_items ii
        left join public.activities a on a.id = ii.activity_id
        where coalesce(ii.place_id, a.place_id) = ${placeId}
      )`,
    ),
  ),
);

export const getTemplate = cache((slug: string) =>
  dbPublic(async (tx) => {
    const [itinerary] = await tx
      .select({
        id: itineraries.id,
        slug: itineraries.slug,
        title: itineraries.title,
        days: itineraries.days,
        dayTitles: itineraries.dayTitles,
      })
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
        activityId: activities.id,
        activitySlug: activities.slug,
        activityTitle: activities.title,
        activityDurationMin: activities.durationMin,
        requiresCar: activities.requiresCar,
        placeId: places.id,
        placeSlug: places.slug,
        placeName: places.name,
        placeCoverImage: places.coverImage,
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

// Offerte attive di un'attività, dalla più economica (senza prezzo in fondo): la prima è
// l'offerta principale, quella della barra mobile.
export const listActivityOffers = cache((activityId: string) =>
  dbPublic((tx) =>
    tx
      .select({
        id: activityOffers.id,
        partner: activityOffers.partner,
        title: activityOffers.title,
        priceFromEur: activityOffers.priceFromEur,
        currency: activityOffers.currency,
        rating: activityOffers.rating,
        reviewsCount: activityOffers.reviewsCount,
        freeCancellation: activityOffers.freeCancellation,
        priceUpdatedAt: activityOffers.priceUpdatedAt,
      })
      .from(activityOffers)
      .where(eq(activityOffers.activityId, activityId))
      .orderBy(sql`${activityOffers.priceFromEur} asc nulls last`, asc(activityOffers.title)),
  ),
);
