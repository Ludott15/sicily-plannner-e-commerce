import "server-only";
import { cache } from "react";
import { and, asc, between, desc, eq, exists, gte, inArray, isNotNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { activityCoverChain, itineraryCoverChain, placeCoverChain, type CoverMedia, type ResolvedCover } from "@/lib/media";
import { distanceKm } from "@/lib/geo";
import { templateFacts } from "@/lib/itinerary-checks";
import { DAY_BUCKET_RANGE, NO_TEMPLATE_FILTERS, type TemplateFilters } from "@/lib/template-filters";
import { dbPublic } from "@/server/db/public";
import type { UserTx } from "@/server/db/user";
import {
  activities,
  activityInterests,
  activityOffers,
  areas,
  interests,
  itineraries,
  itineraryItems,
  itineraryNights,
  media,
  places,
} from "@/server/db/schema";
import { areaCoverJson, coverJson } from "./covers";

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
  // Coordinate del luogo: per la vista mappa della lista attività.
  placeLat: places.lat,
  placeLng: places.lng,
  // Anelli della catena di ripiego (attività → luogo → area), già filtrati dalla RLS.
  ownCover: coverJson(activities.coverMediaId),
  placeCover: coverJson(places.coverMediaId),
  areaCover: areaCoverJson(places.areaId),
};

type CoverColumns = { ownCover: CoverMedia | null; placeCover: CoverMedia | null; areaCover: CoverMedia | null };

// Sostituisce i tre anelli con la copertina risolta.
function withCover<T extends CoverColumns>(row: T) {
  const { ownCover, placeCover, areaCover, ...rest } = row;
  return { ...rest, cover: activityCoverChain({ own: ownCover, place: placeCover, area: areaCover }) };
}

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

async function withTags<T extends { id: string } & CoverColumns>(tx: UserTx, rows: T[]) {
  const tags = await tagsByActivity(
    tx,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({ ...withCover(r), tags: tags.get(r.id) ?? [] }));
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

// Raggio della sezione "vicine" della pagina del luogo.
const NEARBY_RADIUS_KM = 15;
// Gradi di latitudine coperti dal raggio (1 grado ≈ 111 km): il filtro SQL riduce i candidati,
// la distanza esatta si calcola poi con distanceKm.
const NEARBY_LAT_DEGREES = NEARBY_RADIUS_KM / 111;

// "Sulla mappa" della pagina del luogo: attività attive dello stesso luogo e dei luoghi attivi
// entro 15 km, prima per distanza e poi per titolo. Il luogo di partenza deve essere attivo,
// altrimenti la lista è vuota.
export const nearbyActivities = cache((placeId: string, limit = 12) =>
  dbPublic(async (tx) => {
    const [origin] = await tx
      .select({ lat: places.lat, lng: places.lng })
      .from(places)
      .where(and(eq(places.id, placeId), eq(places.isActive, true)));
    if (!origin) return [];

    const rows = await tx
      .select({
        id: activities.id,
        slug: activities.slug,
        title: activities.title,
        placeName: places.name,
        placeId: places.id,
        lat: places.lat,
        lng: places.lng,
      })
      .from(activities)
      .innerJoin(places, eq(places.id, activities.placeId))
      .where(
        and(
          eq(activities.isActive, true),
          eq(places.isActive, true),
          between(places.lat, origin.lat - NEARBY_LAT_DEGREES, origin.lat + NEARBY_LAT_DEGREES),
        ),
      );

    return rows
      .map((row) => ({ ...row, distanceKm: distanceKm(origin, row) }))
      .filter((row) => row.distanceKm <= NEARBY_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm || a.title.localeCompare(b.title, "it"))
      .slice(0, limit);
  }),
);

export const getPlace = cache((slug: string) =>
  dbPublic(async (tx) => {
    const [row] = await tx
      .select({
        id: places.id,
        slug: places.slug,
        name: places.name,
        province: places.province,
        lat: places.lat,
        lng: places.lng,
        description: places.description,
        ownCover: coverJson(places.coverMediaId),
        areaCover: areaCoverJson(places.areaId),
      })
      .from(places)
      .where(eq(places.slug, slug));
    if (!row) return null;
    const { ownCover, areaCover, ...place } = row;
    const rows = await tx
      .select(activityCardColumns)
      .from(activities)
      .innerJoin(places, eq(places.id, activities.placeId))
      .where(eq(activities.placeId, place.id))
      .orderBy(desc(activities.rating), asc(activities.title));
    return { ...place, cover: placeCoverChain({ own: ownCover, area: areaCover }), activities: await withTags(tx, rows) };
  }),
);

// Itinerari pronti (template editoriali pubblicati) con i luoghi toccati, in ordine di visita.
async function templateSummaries(tx: UserTx, where?: SQL) {
  const templates = await tx
    .select({
      id: itineraries.id,
      slug: itineraries.slug,
      title: itineraries.title,
      days: itineraries.days,
      ownCover: coverJson(itineraries.coverMediaId),
    })
    .from(itineraries)
    .where(and(eq(itineraries.isTemplate, true), isNotNull(itineraries.slug), where))
    .orderBy(asc(itineraries.days), asc(itineraries.title));
  if (templates.length === 0) return [];

  const stops = await tx
    .select({
      itineraryId: itineraryItems.itineraryId,
      placeName: places.name,
      placeCover: coverJson(places.coverMediaId),
      areaCover: areaCoverJson(places.areaId),
      areaNameIt: areas.nameIt,
      areaNameEn: areas.nameEn,
      requiresCar: activities.requiresCar,
    })
    .from(itineraryItems)
    .leftJoin(activities, eq(activities.id, itineraryItems.activityId))
    .leftJoin(places, eq(places.id, sql`coalesce(${itineraryItems.placeId}, ${activities.placeId})`))
    .leftJoin(areas, eq(areas.id, places.areaId))
    .where(
      inArray(
        itineraryItems.itineraryId,
        templates.map((t) => t.id),
      ),
    )
    .orderBy(asc(itineraryItems.dayIndex), asc(itineraryItems.position));

  return templates.map(({ ownCover, ...t }) => {
    const own = stops.filter((s) => s.itineraryId === t.id);
    const placeNames = [...new Set(own.flatMap((s) => (s.placeName ? [s.placeName] : [])))];
    // Aree dei luoghi toccati, senza ripetizioni, in ordine di prima apparizione.
    const areaNamesIt = [...new Set(own.flatMap((s) => (s.areaNameIt ? [s.areaNameIt] : [])))];
    const areaNamesEn = [...new Set(own.flatMap((s) => (s.areaNameEn ? [s.areaNameEn] : [])))];
    // Catena: copertina propria → luogo della prima tappa → area di quel luogo.
    const first = own[0];
    return {
      ...t,
      slug: t.slug!,
      placeNames,
      areaNamesIt,
      areaNamesEn,
      cover: itineraryCoverChain({ own: ownCover, firstStop: first?.placeCover, area: first?.areaCover }),
      requiresCar: own.some((s) => s.requiresCar),
    };
  });
}

// Filtri della lista (src/lib/template-filters.ts) come condizione sulla query dei template.
function templateFilterWhere(filters: TemplateFilters): SQL | undefined {
  const parts: SQL[] = [];
  if (filters.days.length > 0) {
    const ranges = filters.days.map((bucket) => {
      const range = DAY_BUCKET_RANGE[bucket];
      return range.max === null
        ? gte(itineraries.days, range.min)
        : and(gte(itineraries.days, range.min), lte(itineraries.days, range.max));
    });
    parts.push(or(...ranges) ?? sql`false`);
  }
  if (filters.area !== null) {
    parts.push(sql`${itineraries.id} in (
      select ii.itinerary_id from public.itinerary_items ii
      left join public.activities a on a.id = ii.activity_id
      join public.places p on p.id = coalesce(ii.place_id, a.place_id)
      join public.areas ar on ar.id = p.area_id
      where ar.slug = ${filters.area})`);
  }
  if (filters.party !== null) {
    parts.push(sql`${itineraries.suitableFor} @> array[${filters.party}]::public.travel_party[]`);
  }
  // Senza mesi consigliati l'itinerario vale tutto l'anno.
  if (filters.month !== null) {
    parts.push(
      sql`(cardinality(${itineraries.seasonMonths}) = 0 or ${itineraries.seasonMonths} @> array[${filters.month}]::smallint[])`,
    );
  }
  return parts.length > 0 ? and(...parts) : undefined;
}

export type TemplateSummary = Awaited<ReturnType<typeof listTemplates>>[number];

// Senza filtri: tutti gli itinerari pronti pubblicati (home e pagine che non filtrano).
export const listTemplates = cache((filters: TemplateFilters = NO_TEMPLATE_FILTERS) =>
  dbPublic((tx) => templateSummaries(tx, templateFilterWhere(filters))),
);

// Aree toccate dagli itinerari pronti pubblicati: le opzioni del filtro "area".
export const listTemplateAreas = cache(() =>
  dbPublic((tx) =>
    tx
      .selectDistinct({ slug: areas.slug, nameIt: areas.nameIt, nameEn: areas.nameEn, sort: areas.sort })
      .from(itineraryItems)
      .innerJoin(
        itineraries,
        and(eq(itineraries.id, itineraryItems.itineraryId), eq(itineraries.isTemplate, true), isNotNull(itineraries.slug)),
      )
      .leftJoin(activities, eq(activities.id, itineraryItems.activityId))
      .innerJoin(places, eq(places.id, sql`coalesce(${itineraryItems.placeId}, ${activities.placeId})`))
      .innerJoin(areas, eq(areas.id, places.areaId))
      .orderBy(asc(areas.sort), asc(areas.nameIt)),
  ),
);

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

// Scheda di un itinerario pronto: testi, tappe con fascia e nota, notti, copertina e fatti
// (budget, auto, aree). Le attività non visibili al pubblico (inattive) risultano senza attività
// e non entrano nei fatti: la RLS le nasconde già.
export const getTemplate = cache((slug: string) =>
  dbPublic(async (tx) => {
    const [itinerary] = await tx
      .select({
        id: itineraries.id,
        slug: itineraries.slug,
        title: itineraries.title,
        subtitle: itineraries.subtitle,
        description: itineraries.description,
        days: itineraries.days,
        dayTitles: itineraries.dayTitles,
        dayIntros: itineraries.dayIntros,
        pace: itineraries.pace,
        suitableFor: itineraries.suitableFor,
        seasonMonths: itineraries.seasonMonths,
        ownCover: coverJson(itineraries.coverMediaId),
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
        timeSlot: itineraryItems.timeSlot,
        customTitle: itineraryItems.customTitle,
        notes: itineraryItems.notes,
        activityId: activities.id,
        activitySlug: activities.slug,
        activityTitle: activities.title,
        activityDurationMin: activities.durationMin,
        onSitePriceEur: activities.onSitePriceEur,
        requiresCar: activities.requiresCar,
        placeId: places.id,
        placeSlug: places.slug,
        placeName: places.name,
        // Coordinate del luogo della tappa (coalesce del luogo della voce e di quello dell'attività).
        lat: places.lat,
        lng: places.lng,
        placeAreaId: places.areaId,
        areaNameIt: areas.nameIt,
        areaNameEn: areas.nameEn,
        placeCover: coverJson(places.coverMediaId),
        areaCover: areaCoverJson(places.areaId),
      })
      .from(itineraryItems)
      .leftJoin(activities, eq(activities.id, itineraryItems.activityId))
      // Una voce può avere un'attività oppure solo un luogo.
      .leftJoin(places, eq(places.id, sql`coalesce(${itineraryItems.placeId}, ${activities.placeId})`))
      .leftJoin(areas, eq(areas.id, places.areaId))
      .where(eq(itineraryItems.itineraryId, itinerary.id))
      .orderBy(asc(itineraryItems.dayIndex), asc(itineraryItems.position));

    const nights = await tx
      .select({
        nightIndex: itineraryNights.nightIndex,
        areaNameIt: areas.nameIt,
        areaNameEn: areas.nameEn,
        placeName: places.name,
      })
      .from(itineraryNights)
      .leftJoin(areas, eq(areas.id, itineraryNights.areaId))
      .leftJoin(places, eq(places.id, itineraryNights.placeId))
      .where(eq(itineraryNights.itineraryId, itinerary.id))
      .orderBy(asc(itineraryNights.nightIndex));

    const facts = templateFacts({
      days: itinerary.days,
      stops: items.map((item) => ({
        activity:
          item.activityId === null
            ? null
            : {
                onSitePriceEur: item.onSitePriceEur === null ? null : Number(item.onSitePriceEur),
                requiresCar: item.requiresCar ?? false,
              },
        placeAreaId: item.placeAreaId,
      })),
    });
    const areaNames = new Map<string, { nameIt: string; nameEn: string }>();
    for (const item of items) {
      if (item.placeAreaId && item.areaNameIt && !areaNames.has(item.placeAreaId)) {
        areaNames.set(item.placeAreaId, { nameIt: item.areaNameIt, nameEn: item.areaNameEn ?? item.areaNameIt });
      }
    }

    const { ownCover, ...rest } = itinerary;
    const first = items[0];
    return {
      ...rest,
      cover: itineraryCoverChain({ own: ownCover, firstStop: first?.placeCover, area: first?.areaCover }),
      items,
      nights,
      facts: {
        budgetPerDayEur: facts.budgetPerDayEur,
        requiresCar: facts.requiresCar,
        areas: facts.areaIds.flatMap((id) => {
          const area = areaNames.get(id);
          return area ? [area] : [];
        }),
      },
    };
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

// Luoghi in evidenza (carosello della home): solo quelli con una foto vera propria e
// pubblica. Un luogo la cui foto è bloccata (alt mancante, autorizzazione scaduta…) esce dal
// carosello senza toccare gli altri: la RLS di media lo nasconde e la riga si scarta qui.
export type FeaturedPlace = {
  id: string;
  slug: string;
  name: string;
  taglineIt: string | null;
  areaNameIt: string | null;
  areaNameEn: string | null;
  cover: CoverMedia;
};

export const listFeaturedPlaces = cache(() =>
  dbPublic(async (tx): Promise<FeaturedPlace[]> => {
    const rows = await tx
      .select({
        id: places.id,
        slug: places.slug,
        name: places.name,
        taglineIt: places.taglineIt,
        areaNameIt: areas.nameIt,
        areaNameEn: areas.nameEn,
        cover: coverJson(places.coverMediaId),
      })
      .from(places)
      .leftJoin(areas, eq(areas.id, places.areaId))
      .where(and(eq(places.isFeatured, true), eq(places.isActive, true)))
      .orderBy(sql`${places.featuredOrder} asc nulls last`, asc(places.name));
    return rows.flatMap((r) => (r.cover?.kind === "photo" ? [{ ...r, cover: r.cover }] : []));
  }),
);

// Hero della home: il luogo con is_home_hero (al più uno, attivo). La copertina è la sua foto
// propria se è una foto; altrimenti l'illustrazione della sua area; se mancano entrambe, null.
export type HomeHero = { placeName: string; placeSlug: string; cover: ResolvedCover };

export const getHomeHero = cache(() =>
  dbPublic(async (tx): Promise<HomeHero | null> => {
    const [row] = await tx
      .select({
        placeName: places.name,
        placeSlug: places.slug,
        ownCover: coverJson(places.coverMediaId),
        areaCover: areaCoverJson(places.areaId),
      })
      .from(places)
      .where(and(eq(places.isHomeHero, true), eq(places.isActive, true)))
      .limit(1);
    if (!row) return null;
    const own = row.ownCover?.kind === "photo" ? row.ownCover : null;
    return {
      placeName: row.placeName,
      placeSlug: row.placeSlug,
      cover: placeCoverChain({ own, area: row.areaCover }),
    };
  }),
);

// Crediti delle foto (/crediti-foto): tutti i media pubblici, con dove sono usati. La RLS
// limita media e entità a ciò che è pubblico; source_link è solo la pagina di Commons.
export const listPhotoCredits = cache(() =>
  dbPublic((tx) =>
    tx
      .select({
        id: media.id,
        kind: media.kind,
        author: media.author,
        authorUrl: media.authorUrl,
        license: media.license,
        licenseUrl: media.licenseUrl,
        sourceLink: media.sourceLink,
        modified: media.modified,
        altIt: media.altIt,
        altEn: media.altEn,
        usedBy: sql<string[]>`array(
          select x.name from (
            select p.name from public.places p where p.cover_media_id = ${media.id}
            union select a.title from public.activities a where a.cover_media_id = ${media.id}
            union select i.title from public.itineraries i where i.cover_media_id = ${media.id} and i.is_template and i.slug is not null
            union select ar.name_it from public.areas ar where ar.cover_media_id = ${media.id}
          ) x order by x.name
        )`,
      })
      .from(media)
      .orderBy(asc(media.kind), asc(media.author), asc(media.id)),
  ),
);
