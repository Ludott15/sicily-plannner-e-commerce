import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { CoverMedia } from "@/lib/media";
import { dbPublic } from "@/server/db/public";
import { activities, areas, guideLinks, guides, itineraries, places } from "@/server/db/schema";
import { coverJson } from "./covers";
import { activityCardColumns, templateSummaries, withTags, type CatalogActivity } from "./queries";

// Letture pubbliche delle aree di viaggio (dbPublic, ruolo anon): come le altre letture del
// catalogo, le attività inattive e gli itinerari non pronti non escono da qui.

// Attività migliori mostrate nella pagina di un'area.
const AREA_ACTIVITIES = 6;

export type AreaPage = {
  slug: string;
  name: string;
  // Solo il testo della lingua richiesta: se manca, la pagina non mostra la sezione.
  description: string | null;
  cover: CoverMedia | null;
  places: { slug: string; name: string }[];
  activities: CatalogActivity[];
  itineraries: { slug: string; title: string; days: number }[];
  // I prodotti non hanno ancora un'area (arrivano con lo shop, passo 7): la lista resta vuota.
  products: { slug: string; title: string }[];
  guides: { slug: string; title: string }[];
};

// Pagina di un'area (/sicilia/<slug>): luoghi attivi dell'area, attività migliori, itinerari pronti
// che toccano l'area, guide che parlano di un suo luogo. Null se l'area non esiste.
export const getAreaPage = cache((slug: string, locale: string) =>
  dbPublic(async (tx): Promise<AreaPage | null> => {
    const [area] = await tx
      .select({
        id: areas.id,
        slug: areas.slug,
        nameIt: areas.nameIt,
        nameEn: areas.nameEn,
        descriptionIt: areas.descriptionIt,
        descriptionEn: areas.descriptionEn,
        cover: coverJson(areas.coverMediaId),
      })
      .from(areas)
      .where(eq(areas.slug, slug));
    if (!area) return null;
    const en = locale === "en";

    // In sequenza: le query di una transazione condividono la stessa connessione.
    const placeRows = await tx
      .select({ slug: places.slug, name: places.name })
      .from(places)
      .where(and(eq(places.areaId, area.id), eq(places.isActive, true)))
      .orderBy(asc(places.name));

    const activityRows = await tx
      .select(activityCardColumns)
      .from(activities)
      .innerJoin(places, eq(places.id, activities.placeId))
      .where(eq(places.areaId, area.id))
      .orderBy(desc(activities.rating), asc(activities.title))
      .limit(AREA_ACTIVITIES);

    const itineraryRows = await templateSummaries(
      tx,
      sql`${itineraries.id} in (
        select ii.itinerary_id from public.itinerary_items ii
        left join public.activities a on a.id = ii.activity_id
        join public.places p on p.id = coalesce(ii.place_id, a.place_id)
        where p.area_id = ${area.id})`,
    );

    const guideRows = await tx
      .select({
        slug: guides.slug,
        titleIt: guides.titleIt,
        titleEn: guides.titleEn,
      })
      .from(guides)
      .innerJoin(guideLinks, and(eq(guideLinks.guideId, guides.id), eq(guideLinks.kind, "place")))
      .innerJoin(places, eq(places.id, guideLinks.targetId))
      .where(and(eq(guides.status, "published"), eq(places.areaId, area.id), eq(places.isActive, true)))
      .orderBy(desc(guides.publishedAt), asc(guides.slug));
    const seenGuides = new Set<string>();
    const guideList = guideRows.flatMap((guide) => {
      if (seenGuides.has(guide.slug)) return [];
      seenGuides.add(guide.slug);
      return [{ slug: guide.slug, title: en && guide.titleEn ? guide.titleEn : guide.titleIt }];
    });

    return {
      slug: area.slug,
      name: en ? area.nameEn : area.nameIt,
      description: en ? area.descriptionEn : area.descriptionIt,
      cover: area.cover,
      places: placeRows,
      activities: await withTags(tx, activityRows),
      itineraries: itineraryRows.map(({ slug, title, days }) => ({ slug, title, days })),
      products: [],
      guides: guideList,
    };
  }),
);

// Itinerari pronti pubblicati che passano da un'attività, per "Nello stesso itinerario".
// I titoli degli itinerari sono in italiano: la lingua non cambia il risultato.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const itinerariesWithActivity = cache((activityId: string, locale: string) =>
  dbPublic(async (tx) => {
    const rows = await templateSummaries(
      tx,
      sql`${itineraries.id} in (
        select ii.itinerary_id from public.itinerary_items ii
        where ii.activity_id = ${activityId})`,
    );
    return rows.map(({ slug, title, days }) => ({ slug, title, days }));
  }),
);

// Slug delle aree, nell'ordine dell'elenco: per la sitemap e per le pagine statiche.
export const listAreaSlugs = cache(() =>
  dbPublic(async (tx) => {
    const rows = await tx.select({ slug: areas.slug }).from(areas).orderBy(asc(areas.sort));
    return rows.map((row) => row.slug);
  }),
);
