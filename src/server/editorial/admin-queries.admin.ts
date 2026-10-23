import "server-only";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { coverJson } from "@/server/catalog/covers";
import { dbAdmin } from "@/server/db/admin";
import { activities, areas, guideLinks, guides, itineraries, places, products } from "@/server/db/schema";
import { isLinkKind, type GuideLinkKind, type GuideSummary } from "./queries";

// Letture dell'admin delle guide e delle aree (dbAdmin: vedono anche le bozze).

export type AdminGuideSummary = GuideSummary & { id: string; status: "draft" | "published" };

// Elenco per l'admin: titoli italiani. Per una bozza la data è quella dell'ultimo aggiornamento.
export async function listAllGuides(): Promise<AdminGuideSummary[]> {
  const rows = await dbAdmin
    .select({
      id: guides.id,
      slug: guides.slug,
      titleIt: guides.titleIt,
      summaryIt: guides.summaryIt,
      authorName: guides.authorName,
      status: guides.status,
      publishedAt: guides.publishedAt,
      updatedAt: guides.updatedAt,
      cover: coverJson(guides.coverMediaId),
    })
    .from(guides)
    .orderBy(desc(guides.updatedAt), asc(guides.slug));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.titleIt,
    summary: row.summaryIt,
    author: row.authorName,
    publishedAt: (row.publishedAt ?? row.updatedAt).toISOString(),
    cover: row.cover,
    status: row.status === "published" ? "published" : "draft",
  }));
}

export type GuideEdit = {
  id: string;
  slug: string;
  titleIt: string;
  titleEn: string | null;
  summaryIt: string | null;
  summaryEn: string | null;
  bodyIt: string;
  bodyEn: string | null;
  authorName: string;
  coverMediaId: string | null;
  status: "draft" | "published";
  publishedAt: string | null;
  links: { kind: GuideLinkKind; targetId: string; position: number }[];
};

export async function getGuideForEdit(id: string): Promise<GuideEdit | null> {
  const [row] = await dbAdmin
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
      coverMediaId: guides.coverMediaId,
      status: guides.status,
      publishedAt: guides.publishedAt,
    })
    .from(guides)
    .where(eq(guides.id, id));
  if (!row) return null;

  const links = await dbAdmin
    .select({ kind: guideLinks.kind, targetId: guideLinks.targetId, position: guideLinks.position })
    .from(guideLinks)
    .where(eq(guideLinks.guideId, id))
    .orderBy(asc(guideLinks.position), asc(guideLinks.kind), asc(guideLinks.targetId));

  return {
    ...row,
    status: row.status === "published" ? "published" : "draft",
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    links: links.flatMap((link) => (isLinkKind(link.kind) ? [{ ...link, kind: link.kind }] : [])),
  };
}

// Bersagli che l'admin può collegare: solo quelli pubblici (luoghi e attività attivi, itinerari
// pronti, prodotti attivi), gli stessi che il pubblico vede.
export type LinkTarget = { kind: GuideLinkKind; id: string; title: string };

export async function listLinkTargets(): Promise<LinkTarget[]> {
  const [placeRows, activityRows, itineraryRows, productRows] = await Promise.all([
    dbAdmin
      .select({ id: places.id, title: places.name })
      .from(places)
      .where(eq(places.isActive, true))
      .orderBy(asc(places.name)),
    dbAdmin
      .select({ id: activities.id, title: activities.title })
      .from(activities)
      .innerJoin(places, eq(places.id, activities.placeId))
      .where(and(eq(activities.isActive, true), eq(places.isActive, true)))
      .orderBy(asc(activities.title)),
    dbAdmin
      .select({ id: itineraries.id, title: itineraries.title })
      .from(itineraries)
      .where(and(eq(itineraries.isTemplate, true), isNotNull(itineraries.slug)))
      .orderBy(asc(itineraries.title)),
    dbAdmin
      .select({ id: products.id, title: products.title })
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(asc(products.title)),
  ]);
  return [
    ...placeRows.map((r) => ({ kind: "place" as const, ...r })),
    ...activityRows.map((r) => ({ kind: "activity" as const, ...r })),
    ...itineraryRows.map((r) => ({ kind: "itinerary" as const, ...r })),
    ...productRows.map((r) => ({ kind: "product" as const, ...r })),
  ];
}

export type AdminArea = {
  id: string;
  slug: string;
  nameIt: string;
  nameEn: string;
  descriptionIt: string | null;
  descriptionEn: string | null;
};

// Aree per l'editor delle descrizioni, nell'ordine dell'elenco.
export async function listAreasForEdit(): Promise<AdminArea[]> {
  return dbAdmin
    .select({
      id: areas.id,
      slug: areas.slug,
      nameIt: areas.nameIt,
      nameEn: areas.nameEn,
      descriptionIt: areas.descriptionIt,
      descriptionEn: areas.descriptionEn,
    })
    .from(areas)
    .orderBy(asc(areas.sort));
}
