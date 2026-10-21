import "server-only";
import { and, asc, eq, exists, or, sql, type SQL } from "drizzle-orm";
import { ALLERGENS, type Allergen } from "@/lib/shop/allergens";
import type { ProductCategory, StockStatus, VatRate } from "@/lib/shop/config";
import { coverJson } from "@/server/catalog/covers";
import { dbPublic } from "@/server/db/public";
import type { UserTx } from "@/server/db/user";
import { activities, areas, boxItems, places, productLinks, productMedia, producers, products } from "@/server/db/schema";
import type { ShopCard, ShopFilters, ShopLocale, ShopProducer, ShopProduct } from "./types";

// Tipi condivisi con le pagine (import di soli tipi).
export type { ShopCard, ShopFilters, ShopProducer, ShopProduct } from "./types";

// Letture pubbliche dello shop (dbPublic, ruolo anon). La RLS decide cosa si vede: prodotti
// vendibili (product_is_sellable) e produttori pubblici. Le colonne sono scelte una per una:
// costo, codice e id del fornitore non escono mai da queste funzioni.

function text(it: string, en: string | null, locale: ShopLocale): string {
  return locale === "en" && en ? en : it;
}

function nullableText(it: string | null, en: string | null, locale: ShopLocale): string | null {
  return locale === "en" && en ? en : it;
}

// Origine: il luogo attivo del prodotto, altrimenti l'area (diretta o del luogo). In italiano e in inglese.
const originPlaceName = sql<string | null>`(select pl.name from public.places pl where pl.id = ${products.placeId} and pl.is_active)`;
const originAreaId = sql`coalesce(${products.areaId}, (select pl.area_id from public.places pl where pl.id = ${products.placeId}))`;
const originAreaIt = sql<string | null>`(select a.name_it from public.areas a where a.id = ${originAreaId})`;
const originAreaEn = sql<string | null>`(select a.name_en from public.areas a where a.id = ${originAreaId})`;

// Prima foto della galleria (la copertina del prodotto).
const firstMedia = sql`(select pm.media_id from public.product_media pm where pm.product_id = ${products.id} order by pm.position limit 1)`;

const cardColumns = {
  id: products.id,
  slug: products.slug,
  titleIt: products.title,
  titleEn: products.titleEn,
  category: products.category,
  formatLabel: products.formatLabel,
  priceCents: products.priceCents,
  vatRate: products.vatRate,
  stockStatus: products.stockStatus,
  originPlaceName,
  originAreaIt,
  originAreaEn,
  cover: coverJson(firstMedia),
  producerSlug: producers.slug,
  producerName: producers.name,
};

type CardRow = {
  id: string;
  slug: string;
  titleIt: string;
  titleEn: string | null;
  category: string;
  formatLabel: string | null;
  priceCents: number;
  vatRate: number;
  stockStatus: string;
  originPlaceName: string | null;
  originAreaIt: string | null;
  originAreaEn: string | null;
  cover: ShopCard["cover"];
  producerSlug: string;
  producerName: string;
};

// I valori sono validati dai check di schema: il cast verso i tipi dei vocabolari è sicuro.
function toCard(row: CardRow, locale: ShopLocale): ShopCard {
  const en = locale === "en";
  return {
    id: row.id,
    slug: row.slug,
    title: text(row.titleIt, row.titleEn, locale),
    category: row.category as ProductCategory,
    formatLabel: row.formatLabel,
    priceCents: row.priceCents,
    vatRate: row.vatRate as VatRate,
    stockStatus: row.stockStatus as StockStatus,
    origin: row.originPlaceName ?? (en ? row.originAreaEn : row.originAreaIt),
    producer: { slug: row.producerSlug, name: row.producerName },
    cover: row.cover,
  };
}

// Il prodotto è in questa area: area diretta, oppure luogo che sta nell'area. Accetta slug o id.
function inArea(areaSlugOrId: SQL): SQL {
  return sql`(
    ${products.areaId} in (select a.id from public.areas a where a.id::text = ${areaSlugOrId} or a.slug = ${areaSlugOrId})
    or ${products.placeId} in (
      select pl.id from public.places pl
      join public.areas a on a.id = pl.area_id
      where a.id::text = ${areaSlugOrId} or a.slug = ${areaSlugOrId})
  )`;
}

async function cardsWhere(tx: UserTx, where: SQL | undefined, locale: ShopLocale, limit?: number): Promise<ShopCard[]> {
  const query = tx
    .select(cardColumns)
    .from(products)
    .innerJoin(producers, eq(producers.id, products.producerId))
    .where(where)
    .orderBy(asc(products.title), asc(products.slug));
  const rows = await (limit === undefined ? query : query.limit(limit));
  return rows.map((row) => toCard({ ...row, titleIt: row.titleIt }, locale));
}

// Prodotti vendibili, con i filtri della pagina /shop. Con limit il tetto va in SQL (la home ne chiede tre).
export function listProducts(filters: ShopFilters, locale: ShopLocale, limit?: number): Promise<ShopCard[]> {
  return dbPublic((tx) =>
    cardsWhere(
      tx,
      and(
        filters.category ? eq(products.category, filters.category) : undefined,
        filters.producer ? eq(producers.slug, filters.producer) : undefined,
        filters.area ? inArea(sql`${filters.area}`) : undefined,
        filters.maxPriceCents !== undefined ? sql`${products.priceCents} <= ${filters.maxPriceCents}` : undefined,
      ),
      locale,
      limit,
    ),
  );
}

// Scheda di un prodotto vendibile. Null se non è vendibile o non esiste.
export function getProduct(slug: string, locale: ShopLocale): Promise<ShopProduct | null> {
  return dbPublic(async (tx): Promise<ShopProduct | null> => {
    const [row] = await tx
      .select({
        ...cardColumns,
        descriptionIt: products.description,
        descriptionEn: products.descriptionEn,
        ingredientsIt: products.ingredientsIt,
        ingredientsEn: products.ingredientsEn,
        allergens: products.allergens,
        allergensDeclared: products.allergensDeclared,
        storageIt: products.storageIt,
        storageEn: products.storageEn,
        minShelfLifeDays: products.minShelfLifeDays,
        isPerishable: products.isPerishable,
        leadTimeDays: products.leadTimeDays,
        isBox: products.isBox,
        productId: products.id,
        producerId: products.producerId,
      })
      .from(products)
      .innerJoin(producers, eq(producers.id, products.producerId))
      .where(eq(products.slug, slug));
    if (!row) return null;

    const gallery = await tx
      .select({ media: coverJson(productMedia.mediaId) })
      .from(productMedia)
      .where(eq(productMedia.productId, row.productId))
      .orderBy(asc(productMedia.position));

    const placeRows = await tx
      .select({ slug: places.slug, name: places.name, position: productLinks.position })
      .from(productLinks)
      .innerJoin(places, and(eq(places.id, productLinks.targetId), eq(places.isActive, true)))
      .where(and(eq(productLinks.productId, row.productId), eq(productLinks.kind, "place")))
      .orderBy(asc(productLinks.position));

    const activityRows = await tx
      .select({ slug: activities.slug, titleIt: activities.title, titleEn: activities.titleEn, position: productLinks.position })
      .from(productLinks)
      .innerJoin(activities, and(eq(activities.id, productLinks.targetId), eq(activities.isActive, true)))
      .where(and(eq(productLinks.productId, row.productId), eq(productLinks.kind, "activity")))
      .orderBy(asc(productLinks.position));

    const boxRows = row.isBox
      ? await tx
          .select({ slug: products.slug, titleIt: products.title, titleEn: products.titleEn, quantity: boxItems.quantity })
          .from(boxItems)
          .innerJoin(products, eq(products.id, boxItems.productId))
          .where(eq(boxItems.boxId, row.productId))
          .orderBy(asc(products.title))
      : [];

    const card = toCard({ ...row, titleIt: row.titleIt }, locale);
    return {
      ...card,
      descriptionText: nullableText(row.descriptionIt, row.descriptionEn, locale),
      ingredients: nullableText(row.ingredientsIt, row.ingredientsEn, locale),
      allergens: ALLERGENS.filter((allergen): allergen is Allergen => row.allergens.includes(allergen)),
      allergensDeclared: row.allergensDeclared,
      storage: nullableText(row.storageIt, row.storageEn, locale),
      minShelfLifeDays: row.minShelfLifeDays,
      isPerishable: row.isPerishable,
      leadTimeDays: row.leadTimeDays,
      gallery: gallery.flatMap((g) => (g.media ? [g.media] : [])),
      links: [
        ...placeRows.map((p) => ({ kind: "place" as const, slug: p.slug, title: p.name })),
        ...activityRows.map((a) => ({ kind: "activity" as const, slug: a.slug, title: text(a.titleIt, a.titleEn, locale) })),
      ],
      boxItems: boxRows.map((b) => ({ slug: b.slug, title: text(b.titleIt, b.titleEn, locale), quantity: b.quantity })),
    };
  });
}

// Produttore pubblico. Null se non è pubblico, non è attivo o non esiste.
export function getProducer(slug: string, locale: ShopLocale): Promise<ShopProducer | null> {
  return dbPublic(async (tx): Promise<ShopProducer | null> => {
    const [row] = await tx
      .select({
        slug: producers.slug,
        name: producers.name,
        storyIt: producers.storyIt,
        storyEn: producers.storyEn,
        cover: coverJson(producers.coverMediaId),
        areaSlug: areas.slug,
        areaNameIt: areas.nameIt,
        areaNameEn: areas.nameEn,
        placeSlug: places.slug,
        placeName: places.name,
      })
      .from(producers)
      .leftJoin(areas, eq(areas.id, producers.areaId))
      .leftJoin(places, and(eq(places.id, producers.placeId), eq(places.isActive, true)))
      .where(eq(producers.slug, slug));
    if (!row) return null;
    const en = locale === "en";
    return {
      slug: row.slug,
      name: row.name,
      story: nullableText(row.storyIt, row.storyEn, locale),
      cover: row.cover,
      area: row.areaSlug ? { slug: row.areaSlug, name: (en ? row.areaNameEn : row.areaNameIt) ?? "" } : null,
      place: row.placeSlug ? { slug: row.placeSlug, name: row.placeName ?? "" } : null,
    };
  });
}

// Prodotti collegati a un luogo: quelli che stanno nel luogo, o che lo indicano nei collegamenti.
// Un luogo non pubblico (inattivo) non mostra nessun prodotto: la regola vale per tutti i collegamenti.
export function productsForPlace(placeId: string, locale: ShopLocale): Promise<ShopCard[]> {
  return dbPublic((tx) =>
    cardsWhere(
      tx,
      and(
        sql`exists (select 1 from public.places pl where pl.id = ${placeId} and pl.is_active)`,
        or(
        eq(products.placeId, placeId),
        exists(
          tx
            .select({ one: sql`1` })
            .from(productLinks)
            .where(and(eq(productLinks.productId, products.id), eq(productLinks.kind, "place"), eq(productLinks.targetId, placeId))),
        ),
        ),
      ),
      locale,
    ),
  );
}

// Prodotti di un'area: area diretta o luogo dell'area. Dentro una transazione già aperta (pagina area).
export function productCardsForArea(tx: UserTx, areaId: string, locale: ShopLocale): Promise<ShopCard[]> {
  return cardsWhere(tx, inArea(sql`${areaId}`), locale);
}

export function productsForArea(areaId: string, locale: ShopLocale): Promise<ShopCard[]> {
  return dbPublic((tx) => productCardsForArea(tx, areaId, locale));
}

// Prodotti collegati a un'attività ("Dal territorio").
// Un'attività non attiva non mostra prodotti: i collegamenti verso target non pubblici non si mostrano.
export function productsForActivity(activityId: string, locale: ShopLocale): Promise<ShopCard[]> {
  return dbPublic((tx) =>
    cardsWhere(
      tx,
      and(
        sql`exists (select 1 from public.activities a where a.id = ${activityId} and a.is_active)`,
        exists(
        tx
          .select({ one: sql`1` })
          .from(productLinks)
          .where(and(eq(productLinks.productId, products.id), eq(productLinks.kind, "activity"), eq(productLinks.targetId, activityId))),
      ),
      ),
      locale,
    ),
  );
}

// Produttori pubblici per il filtro della lista /shop.
export function listProducerOptions(locale: ShopLocale): Promise<{ slug: string; name: string }[]> {
  void locale;
  return dbPublic((tx) => tx.select({ slug: producers.slug, name: producers.name }).from(producers).orderBy(asc(producers.name)));
}

// Aree per il filtro della lista /shop, nell'ordine dell'elenco.
export function listShopAreaOptions(locale: ShopLocale): Promise<{ slug: string; name: string }[]> {
  return dbPublic(async (tx) => {
    const rows = await tx
      .select({ slug: areas.slug, nameIt: areas.nameIt, nameEn: areas.nameEn })
      .from(areas)
      .orderBy(asc(areas.sort), asc(areas.slug));
    return rows.map((row) => ({ slug: row.slug, name: text(row.nameIt, row.nameEn, locale) }));
  });
}

// Slug dei prodotti vendibili, per la sitemap.
export function listProductSlugs(): Promise<string[]> {
  return dbPublic(async (tx) => {
    const rows = await tx.select({ slug: products.slug }).from(products).orderBy(asc(products.slug));
    return rows.map((row) => row.slug);
  });
}

// Slug dei produttori pubblici, per la sitemap.
export function listProducerSlugs(): Promise<string[]> {
  return dbPublic(async (tx) => {
    const rows = await tx.select({ slug: producers.slug }).from(producers).orderBy(asc(producers.slug));
    return rows.map((row) => row.slug);
  });
}
