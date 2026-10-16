"use server";

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AdminErrorCode } from "@/lib/admin-form";
import { databaseErrorCode, type EditorialResult } from "@/lib/editorial-result";
import { routing } from "@/lib/i18n/routing";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { activities, guideLinks, guides, itineraries, places, products } from "@/server/db/schema";

// Azioni dell'admin delle guide: Zod → requireAdmin → scrittura con dbAdmin. La RLS e i vincoli
// del database restano la seconda difesa (slug, data di pubblicazione, lunghezze).
// Le azioni non cambiano pagina: restituiscono l'esito e il form resta com'è.

const LINK_KINDS = ["place", "activity", "itinerary", "product"] as const;
type LinkKind = (typeof LINK_KINDS)[number];
const MAX_LINKS = 50;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Tx = Parameters<Parameters<typeof dbAdmin.transaction>[0]>[0];

const invalid: EditorialResult = { status: "error", code: "invalid" };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

const optionalUuid = z
  .string()
  .transform((value) => (value === "" ? null : value))
  .pipe(z.uuid().nullable());

const optionalId = z.uuid().optional().or(z.literal("").transform(() => undefined));

const guideSchema = z.object({
  id: optionalId,
  slug: z.string().trim().min(1).max(120).regex(SLUG),
  titleIt: z.string().trim().min(1).max(160),
  titleEn: optionalText(160),
  summaryIt: optionalText(300),
  summaryEn: optionalText(300),
  bodyIt: z.string().trim().min(1).max(60000),
  bodyEn: optionalText(60000),
  authorName: z.string().trim().min(2).max(120),
  coverMediaId: optionalUuid,
});

const idSchema = z.object({ id: z.uuid() });

const linkSchema = z.object({
  kind: z.enum(LINK_KINDS),
  targetId: z.uuid(),
  position: z.number().int().min(0).max(99),
});

// I collegamenti arrivano come JSON in un campo del form (un elenco non è un valore di FormData).
const linksSchema = z.object({
  id: z.uuid(),
  links: z.preprocess((raw) => {
    if (typeof raw !== "string") return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, z.array(linkSchema).max(MAX_LINKS)),
});

// Percorsi delle pagine che mostrano una guida: l'elenco e la pagina di ciascuna lingua.
function revalidateGuidePages(slug: string) {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/guide`);
    revalidatePath(`/${locale}/guide/${slug}`);
  }
}

// Crea o aggiorna una guida (bozza se nuova; lo stato non cambia in un aggiornamento).
export async function saveGuide(formData: FormData): Promise<EditorialResult> {
  const parsed = guideSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid;
  await requireAdmin();
  const { id, ...fields } = parsed.data;
  try {
    if (id) {
      const [row] = await dbAdmin
        .update(guides)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(guides.id, id))
        .returning({ id: guides.id, slug: guides.slug });
      if (!row) return invalid;
      revalidateGuidePages(row.slug);
      return { status: "ok", id: row.id };
    }
    const [row] = await dbAdmin
      .insert(guides)
      .values({ ...fields, status: "draft" })
      .returning({ id: guides.id, slug: guides.slug });
    if (!row) return invalid;
    revalidateGuidePages(row.slug);
    return { status: "ok", id: row.id };
  } catch (error) {
    return { status: "error", code: databaseErrorCode(error) };
  }
}

async function changeStatus(id: string, status: "draft" | "published"): Promise<EditorialResult> {
  try {
    const [row] = await dbAdmin
      .update(guides)
      .set(
        status === "published"
          ? { status, publishedAt: sql`coalesce(${guides.publishedAt}, now())`, updatedAt: new Date() }
          : { status, updatedAt: new Date() },
      )
      .where(eq(guides.id, id))
      .returning({ id: guides.id, slug: guides.slug });
    if (!row) return invalid;
    revalidateGuidePages(row.slug);
    return { status: "ok", id: row.id };
  } catch (error) {
    return { status: "error", code: databaseErrorCode(error) };
  }
}

// Pubblica la guida: la prima pubblicazione fissa la data, le successive la lasciano com'è.
export async function publishGuide(formData: FormData): Promise<EditorialResult> {
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid;
  await requireAdmin();
  return changeStatus(parsed.data.id, "published");
}

// Ritira la guida: torna bozza e fuori dal pubblico; la data di pubblicazione resta.
export async function unpublishGuide(formData: FormData): Promise<EditorialResult> {
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid;
  await requireAdmin();
  return changeStatus(parsed.data.id, "draft");
}

// Cancella la guida; i suoi collegamenti se ne vanno con lei (cascade).
export async function deleteGuide(formData: FormData): Promise<EditorialResult> {
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid;
  await requireAdmin();
  try {
    const [row] = await dbAdmin.delete(guides).where(eq(guides.id, parsed.data.id)).returning({ slug: guides.slug });
    if (!row) return invalid;
    revalidateGuidePages(row.slug);
    return { status: "ok", id: parsed.data.id };
  } catch (error) {
    return { status: "error", code: databaseErrorCode(error) };
  }
}

function idSet(rows: { id: string }[]): Set<string> {
  return new Set(rows.map((row) => row.id));
}

// Dei bersagli indicati, quelli che il pubblico vede davvero (stesse condizioni delle letture).
async function publicTargetIds(tx: Tx, kind: LinkKind, ids: string[]): Promise<Set<string>> {
  switch (kind) {
    case "place":
      return idSet(
        await tx
          .select({ id: places.id })
          .from(places)
          .where(and(inArray(places.id, ids), eq(places.isActive, true))),
      );
    case "activity":
      return idSet(
        await tx
          .select({ id: activities.id })
          .from(activities)
          .innerJoin(places, eq(places.id, activities.placeId))
          .where(and(inArray(activities.id, ids), eq(activities.isActive, true), eq(places.isActive, true))),
      );
    case "itinerary":
      return idSet(
        await tx
          .select({ id: itineraries.id })
          .from(itineraries)
          .where(and(inArray(itineraries.id, ids), eq(itineraries.isTemplate, true), isNotNull(itineraries.slug))),
      );
    case "product":
      return idSet(
        await tx
          .select({ id: products.id })
          .from(products)
          .where(and(inArray(products.id, ids), eq(products.isActive, true))),
      );
  }
}

// Sostituisce i collegamenti della guida. Ogni bersaglio deve essere pubblico: un luogo
// inattivo o un'attività senza luogo attivo non si collega. Tutto in una transazione.
export async function setGuideLinks(formData: FormData): Promise<EditorialResult> {
  const parsed = linksSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid;
  await requireAdmin();
  const { id, links } = parsed.data;
  const keys = new Set(links.map((link) => `${link.kind}:${link.targetId}`));
  if (keys.size !== links.length) return invalid;

  try {
    const result = await dbAdmin.transaction(
      async (tx): Promise<{ ok: true; slug: string } | { ok: false; code: AdminErrorCode }> => {
        const [guide] = await tx.select({ slug: guides.slug }).from(guides).where(eq(guides.id, id));
        if (!guide) return { ok: false, code: "invalid" };

        for (const kind of LINK_KINDS) {
          const ids = links.filter((link) => link.kind === kind).map((link) => link.targetId);
          if (ids.length === 0) continue;
          const allowed = await publicTargetIds(tx, kind, ids);
          if (allowed.size !== ids.length) return { ok: false, code: "invalid" };
        }

        await tx.delete(guideLinks).where(eq(guideLinks.guideId, id));
        if (links.length > 0) {
          await tx.insert(guideLinks).values(
            links.map((link) => ({
              guideId: id,
              kind: link.kind,
              targetId: link.targetId,
              position: link.position,
            })),
          );
        }
        return { ok: true, slug: guide.slug };
      },
    );
    if (!result.ok) return { status: "error", code: result.code };
    revalidateGuidePages(result.slug);
    return { status: "ok", id };
  } catch (error) {
    return { status: "error", code: databaseErrorCode(error) };
  }
}
