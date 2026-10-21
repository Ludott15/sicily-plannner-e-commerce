import "server-only";
import { cache } from "react";
import { asc, desc, eq, inArray, isNotNull, and } from "drizzle-orm";
import type { CoverMedia } from "@/lib/media";
import { coverJson } from "@/server/catalog/covers";
import { dbPublic } from "@/server/db/public";
import type { UserTx } from "@/server/db/user";
import { activities, guideLinks, guides, itineraries, places, products } from "@/server/db/schema";

// Guide pubblicate (passo 11.1). Letture come anon (dbPublic): la RLS lascia passare solo le
// guide pubblicate e i loro collegamenti; i bersagli dei collegamenti si risolvono solo se
// sono pubblici (luoghi e attività attivi, itinerari pronti, prodotti attivi).

export type GuideLinkKind = "place" | "activity" | "itinerary" | "product";

export type GuideSummary = {
  slug: string;
  title: string;
  summary: string | null;
  author: string;
  publishedAt: string;
  cover: CoverMedia | null;
};

export type GuideLink = { kind: GuideLinkKind; slug: string; title: string };

export type GuideDetail = GuideSummary & {
  body: string;
  updatedAt: string;
  links: GuideLink[];
  // In inglese: false se manca la traduzione (titolo o testo); la pagina mostra allora l'italiano.
  translated: boolean;
};

type RawLink = { kind: GuideLinkKind; targetId: string };

export function isLinkKind(value: string): value is GuideLinkKind {
  return value === "place" || value === "activity" || value === "itinerary" || value === "product";
}

// Titoli e testi nella lingua richiesta, con il ripiego sull'italiano per il titolo.
function inLocale(locale: string, it: string, en: string | null): string {
  return locale === "en" && en ? en : it;
}

// Risolve i bersagli dei collegamenti, mantenendo l'ordine. Ogni tipo passa dalla propria
// condizione di pubblicazione: un bersaglio non pubblico (o cancellato) viene scartato.
async function resolveLinks(tx: UserTx, rows: RawLink[]): Promise<GuideLink[]> {
  const idsOf = (kind: GuideLinkKind) => rows.filter((r) => r.kind === kind).map((r) => r.targetId);
  const placeIds = idsOf("place");
  const activityIds = idsOf("activity");
  const itineraryIds = idsOf("itinerary");
  const productIds = idsOf("product");

  // In sequenza: le query di una transazione condividono la stessa connessione.
  const placeRows = placeIds.length
    ? await tx
        .select({ id: places.id, title: places.name, slug: places.slug })
        .from(places)
        .where(and(inArray(places.id, placeIds), eq(places.isActive, true)))
    : [];
  const activityRows = activityIds.length
    ? await tx
        .select({ id: activities.id, title: activities.title, slug: activities.slug })
        .from(activities)
        .innerJoin(places, eq(places.id, activities.placeId))
        .where(and(inArray(activities.id, activityIds), eq(activities.isActive, true), eq(places.isActive, true)))
    : [];
  const itineraryRows = itineraryIds.length
    ? await tx
        .select({ id: itineraries.id, title: itineraries.title, slug: itineraries.slug })
        .from(itineraries)
        .where(
          and(inArray(itineraries.id, itineraryIds), eq(itineraries.isTemplate, true), isNotNull(itineraries.slug)),
        )
    : [];
  const productRows = productIds.length
    ? await tx
        .select({ id: products.id, title: products.title, slug: products.slug })
        .from(products)
        .where(and(inArray(products.id, productIds), eq(products.isActive, true)))
    : [];

  const found = new Map<string, { title: string; slug: string | null }>();
  for (const row of [...placeRows, ...activityRows, ...itineraryRows, ...productRows]) {
    found.set(row.id, { title: row.title, slug: row.slug });
  }

  return rows.flatMap((row): GuideLink[] => {
    const target = found.get(row.targetId);
    if (!target || !target.slug) return [];
    return [{ kind: row.kind, slug: target.slug, title: target.title }];
  });
}

// Elenco delle guide pubblicate, dalla più recente. Con limit il tetto va in SQL (la home ne chiede tre).
export const listGuides = cache((locale: string, limit?: number) =>
  dbPublic(async (tx): Promise<GuideSummary[]> => {
    const query = tx
      .select({
        slug: guides.slug,
        titleIt: guides.titleIt,
        titleEn: guides.titleEn,
        summaryIt: guides.summaryIt,
        summaryEn: guides.summaryEn,
        authorName: guides.authorName,
        publishedAt: guides.publishedAt,
        createdAt: guides.createdAt,
        cover: coverJson(guides.coverMediaId),
      })
      .from(guides)
      .where(eq(guides.status, "published"))
      .orderBy(desc(guides.publishedAt), asc(guides.slug));
    const rows = await (limit === undefined ? query : query.limit(limit));

    return rows.map((row) => ({
      slug: row.slug,
      title: inLocale(locale, row.titleIt, row.titleEn),
      summary: inLocale(locale, row.summaryIt ?? "", row.summaryEn) || null,
      author: row.authorName,
      publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
      cover: row.cover,
    }));
  }),
);

// Una guida pubblicata con il suo testo e i collegamenti. Null se non esiste o non è pubblicata
// (la RLS nasconde le bozze, il filtro lo ripete in modo esplicito).
export const getGuide = cache((slug: string, locale: string) =>
  dbPublic(async (tx): Promise<GuideDetail | null> => {
    const [row] = await tx
      .select({
        id: guides.id,
        slug: guides.slug,
        titleIt: guides.titleIt,
        titleEn: guides.titleEn,
        summaryIt: guides.summaryIt,
        summaryEn: guides.summaryEn,
        bodyIt: guides.bodyIt,
        bodyEn: guides.bodyEn,
        authorName: guides.authorName,
        publishedAt: guides.publishedAt,
        createdAt: guides.createdAt,
        updatedAt: guides.updatedAt,
        cover: coverJson(guides.coverMediaId),
      })
      .from(guides)
      .where(and(eq(guides.slug, slug), eq(guides.status, "published")));
    if (!row) return null;

    // Inglese solo se la guida è tradotta per intero (titolo e testo): niente testi mescolati.
    const translated = locale !== "en" || (row.titleEn !== null && row.bodyEn !== null);
    const useEn = locale === "en" && translated;

    const linkRows = await tx
      .select({ kind: guideLinks.kind, targetId: guideLinks.targetId })
      .from(guideLinks)
      .where(eq(guideLinks.guideId, row.id))
      .orderBy(asc(guideLinks.position), asc(guideLinks.kind), asc(guideLinks.targetId));

    return {
      slug: row.slug,
      title: useEn && row.titleEn ? row.titleEn : row.titleIt,
      summary: useEn ? row.summaryEn : row.summaryIt,
      author: row.authorName,
      publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      cover: row.cover,
      body: useEn && row.bodyEn ? row.bodyEn : row.bodyIt,
      links: await resolveLinks(tx, linkRows.flatMap((link) => (isLinkKind(link.kind) ? [{ kind: link.kind, targetId: link.targetId }] : []))),
      translated,
    };
  }),
);

// Slug delle guide pubblicate: per la sitemap e le pagine statiche.
export const listGuideSlugs = cache(() =>
  dbPublic(async (tx) => {
    const rows = await tx
      .select({ slug: guides.slug })
      .from(guides)
      .where(eq(guides.status, "published"))
      .orderBy(asc(guides.slug));
    return rows.map((row) => row.slug);
  }),
);
