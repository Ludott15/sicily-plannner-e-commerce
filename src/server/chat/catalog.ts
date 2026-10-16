import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { partnerName } from "@/server/affiliates/links";
import { activityCardColumns, getActivityById, listActivityOffers } from "@/server/catalog/queries";
import { activities, activityInterests, areas, places, products } from "@/server/db/schema";
import { dbPublic } from "@/server/db/public";
import { activityCoverChain, mediaUrl, variantPath, type CoverMedia } from "@/lib/media";
import type { ChatActivityCard } from "@/lib/chat/events";

// Letture del catalogo per il chatbot (passo 9.1). Tutte con dbPublic: il chatbot vede solo ciò
// che vede un visitatore (attività attive, offerte attive, recensioni pubbliche). Nessuna query
// dentro i cicli: i batch usano inArray.

export type CatalogSearchRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  placeName: string;
  area: string;
  durationMin: number;
  onSitePriceEur: number | null;
  offerPriceFromEur: number | null;
  rating: number | null;
  interests: { key: string; strength: number }[];
};

// Tutte le attività attive con i campi usati per cercare e filtrare (una query, più una per i tag).
export async function searchableCatalog(): Promise<CatalogSearchRow[]> {
  return dbPublic(async (tx) => {
    const rows = await tx
      .select({
        id: activities.id,
        slug: activities.slug,
        title: activities.title,
        description: activities.description,
        placeName: places.name,
        area: areas.slug,
        durationMin: activities.durationMin,
        onSitePriceEur: activities.onSitePriceEur,
        offerPriceFromEur: sql<string | null>`(
          select min(o.price_from_eur) from public.activity_offers o
          where o.activity_id = ${activities.id} and o.is_active)`,
        rating: activities.rating,
      })
      .from(activities)
      .innerJoin(places, eq(places.id, activities.placeId))
      .innerJoin(areas, eq(areas.id, places.areaId))
      .where(eq(activities.isActive, true))
      .orderBy(asc(activities.title));
    const ids = rows.map((row) => row.id);
    const tags = ids.length
      ? await tx
          .select({ activityId: activityInterests.activityId, key: activityInterests.interestKey, strength: activityInterests.strength })
          .from(activityInterests)
          .where(inArray(activityInterests.activityId, ids))
      : [];
    return rows.map((row) => ({
      ...row,
      onSitePriceEur: row.onSitePriceEur === null ? null : Number(row.onSitePriceEur),
      offerPriceFromEur: row.offerPriceFromEur === null ? null : Number(row.offerPriceFromEur),
      rating: row.rating === null ? null : Number(row.rating),
      interests: tags.filter((tag) => tag.activityId === row.id).map((tag) => ({ key: tag.key, strength: tag.strength })),
    }));
  });
}

// Offerta migliore (la più economica attiva) per attività: una query per il batch.
type BestOffer = { id: string; partner: Parameters<typeof partnerName>[0] };
async function bestOffers(activityIds: string[]): Promise<Map<string, BestOffer>> {
  if (activityIds.length === 0) return new Map();
  const rows = await dbPublic((tx) =>
    tx.execute<{ id: string; activity_id: string; partner: BestOffer["partner"] }>(sql`
      select distinct on (o.activity_id) o.id, o.activity_id, o.partner
      from public.activity_offers o
      where o.activity_id in (${sql.join(activityIds.map((id) => sql`${id}::uuid`), sql`, `)}) and o.is_active
      order by o.activity_id, o.price_from_eur asc nulls last, o.id`),
  );
  return new Map(rows.map((row) => [row.activity_id, { id: row.id, partner: row.partner }]));
}

function coverUrlOf(media: CoverMedia | null): string | null {
  if (!media) return null;
  return mediaUrl(variantPath(media.id, media.variantsVersion, "16x9", 800, "webp"));
}

// Schede per le attività citate: ordine di ids, senza quelle non più attive. Il link di uscita
// va all'offerta migliore (/api/go, contesto chat), con l'itinerario se la chat è legata a uno.
export async function activityCards(
  ids: readonly string[],
  locale: string,
  itineraryId: string | null,
): Promise<ChatActivityCard[]> {
  if (ids.length === 0) return [];
  const rows = await dbPublic((tx) =>
    tx
      .select(activityCardColumns)
      .from(activities)
      .innerJoin(places, eq(places.id, activities.placeId))
      .where(and(inArray(activities.id, [...ids]), eq(activities.isActive, true))),
  );
  const offers = await bestOffers(rows.map((row) => row.id));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const cards: ChatActivityCard[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    const offer = offers.get(id);
    const cover = activityCoverChain({ own: row.ownCover, place: row.placeCover, area: row.areaCover });
    const itineraryParam = itineraryId ? `&i=${itineraryId}` : "";
    cards.push({
      id: row.id,
      slug: row.slug,
      title: row.title,
      placeName: row.placeName,
      priceFromCents: row.offerPriceFromEur === null ? null : Math.round(Number(row.offerPriceFromEur) * 100),
      durationMinutes: row.durationMin,
      rating: row.rating === null ? null : Number(row.rating),
      coverUrl: coverUrlOf(cover?.media ?? null),
      goHref: offer ? `/api/go/${offer.id}?c=chat&l=${locale}${itineraryParam}` : null,
      partnerName: offer ? partnerName(offer.partner) : null,
    });
  }
  return cards;
}

// Scheda completa di un'attività per lo strumento get_activity: descrizione, offerte e le ultime
// recensioni pubbliche (testo libero dei visitatori: dati, da escapare nel contesto).
export async function activityDetail(id: string) {
  const activity = await getActivityById(id);
  if (!activity) return null;
  const offers = await listActivityOffers(id);
  const reviews = await dbPublic((tx) =>
    tx.execute<{ rating: number; body: string | null }>(sql`
      select r.rating, r.body from public.public_reviews r
      where r.activity_id = ${id}::uuid and r.body is not null
      order by r.created_at desc limit 3`),
  );
  return { activity, offers, reviews };
}

// Prodotti attivi che corrispondono al testo (lo shop è al passo 7: oggi il catalogo può essere vuoto).
export async function searchProducts(query: string) {
  const pattern = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  return dbPublic((tx) =>
    tx
      .select({ slug: products.slug, title: products.title, priceCents: products.priceCents, weightG: products.weightG })
      .from(products)
      .where(
        and(
          eq(products.isActive, true),
          sql`(${products.title} ilike ${pattern} or coalesce(${products.description}, '') ilike ${pattern})`,
        ),
      )
      .orderBy(desc(products.createdAt))
      .limit(5),
  );
}

// Titoli delle attività attive per id, in una sola query (le proposte di modifica).
export async function activityTitles(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await dbPublic((tx) =>
    tx
      .select({ id: activities.id, title: activities.title })
      .from(activities)
      .where(and(inArray(activities.id, [...ids]), eq(activities.isActive, true))),
  );
  return new Map(rows.map((row) => [row.id, row.title]));
}
