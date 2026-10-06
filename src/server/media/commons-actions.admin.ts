"use server";

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type {
  AutoAssignItem,
  AutoAssignStep,
  CandidateSearch,
  PhotoCandidate,
  PhotoImport,
} from "@/lib/media-admin";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { media, places } from "@/server/db/schema";
import { entitiesNeedingPhoto, importedCommonsPages, type PhotoNeed } from "./admin-queries.admin";
import { commonsFileTitle, downloadCommonsFile, fetchCommonsFile } from "./commons";
import { keywords, searchCommons, type CommonsCandidate, type SearchTarget } from "./commons-search";
import { ingestPhoto, setCover } from "./ingest.admin";

// Foto vere da Wikimedia Commons per le entità che non ne hanno (docs/IMMAGINI.md, "Foto da
// Commons"): ricerca per posizione e per nome, importazione con gli stessi controlli
// dell'importatore (licenza, dimensioni, download da upload.wikimedia.org, EXIF rimosso).
// Zod → requireAdmin → scrittura, come le altre azioni dell'admin.

const MEDIA_PATHS = ["/[locale]/admin/media", "/[locale]/admin/media/foto-commons"] as const;
const entitySchema = z.object({
  type: z.enum(["area", "place", "activity", "itinerary"]),
  id: z.uuid(),
  // CC BY-SA ammessa solo se l'admin la abilita esplicitamente (docs/IMMAGINI.md, Licenze).
  allowSa: z.boolean().default(false),
});

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}

const cleanName = (name: string) => name.replace(/\[DEMO\]\s*/gi, "").trim();

// (Non esportata: da un file "use server" ogni export diventa un'azione chiamabile.)
// Cosa cercare per ogni tipo di entità. Luoghi e aree: vicino alle coordinate o per nome.
// Attività e itinerari: per nome, con almeno metà delle parole chiave nel titolo o nella
// descrizione del file (altrimenti meglio il ripiego sulla foto del luogo che una foto sbagliata).
async function photoTarget(need: PhotoNeed): Promise<SearchTarget> {
  const name = cleanName(need.name);
  const words = keywords(name).join(" ");
  if (need.type === "place") return { name, query: words || name, lat: need.lat, lng: need.lng, requireNameMatch: false };
  if (need.type === "area") return { name, query: `${words} Sicilia`, lat: null, lng: null, requireNameMatch: true };
  return { name, query: words || name, lat: need.lat, lng: need.lng, requireNameMatch: true };
}

const toView = (c: CommonsCandidate): PhotoCandidate => ({
  pageUrl: c.pageUrl,
  previewUrl: c.previewUrl,
  title: c.title,
  author: c.author,
  license: c.license,
  description: c.description,
  width: c.width,
  height: c.height,
  score: c.score,
  warnings: c.warnings,
});

export async function searchCommonsForEntity(input: unknown): Promise<CandidateSearch> {
  const parsed = entitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await requireAdmin();
  const { type, id, allowSa } = parsed.data;
  const [need] = await entitiesNeedingPhoto(1, { type, id });
  if (!need) return { ok: false, error: "entity_not_found" };
  const result = await searchCommons(await photoTarget(need), await importedCommonsPages(), undefined, { allowSa });
  if (!result.ok) return result;
  return { ok: true, candidates: result.candidates.slice(0, 8).map(toView), stats: result.stats };
}

// Importa una pagina di Commons e la mette come copertina dell'entità. I metadati si rileggono
// dal server: dal browser arriva solo l'indirizzo della pagina.
async function importFor(need: PhotoNeed, pageUrl: string, altIt: string | null, userId: string, allowSa: boolean): Promise<PhotoImport> {
  const fetched = await fetchCommonsFile(pageUrl, undefined, { allowSa });
  if (!fetched.ok) return { ok: false, error: fetched.error };
  const [existing] = await dbAdmin.select({ id: media.id }).from(media).where(eq(media.sourceUrl, fetched.file.pageUrl || "-"));
  if (existing) {
    await setCover(need, existing.id);
    return { ok: true, mediaId: existing.id };
  }
  const downloaded = await downloadCommonsFile(fetched.file.downloadUrl);
  if (!downloaded.ok) return { ok: false, error: downloaded.error };
  const alt = (altIt?.trim() || fetched.file.description || cleanName(need.name)).slice(0, 300);
  const ingested = await ingestPhoto(
    downloaded.body,
    fetched.file.title.replace(/^File:/, ""),
    {
      sourceType: "licensed",
      altIt: alt,
      author: fetched.file.author,
      authorUrl: fetched.file.authorUrl,
      license: fetched.file.license,
      licenseUrl: fetched.file.licenseUrl,
      sourceUrl: fetched.file.pageUrl || null,
      accessedAt: today(),
      modified: true,
    },
    userId,
  );
  if (!ingested.ok) return { ok: false, error: ingested.error.code };
  await setCover(need, ingested.mediaId);
  return { ok: true, mediaId: ingested.mediaId };
}

const importSchema = entitySchema.extend({
  pageUrl: z.string().url().refine((u) => commonsFileTitle(u) !== null),
  altIt: z.string().trim().max(300).optional(),
});

export async function importCommonsForEntity(input: unknown): Promise<PhotoImport> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { user } = await requireAdmin();
  const { type, id, pageUrl, altIt, allowSa } = parsed.data;
  const [need] = await entitiesNeedingPhoto(1, { type, id });
  if (!need) return { ok: false, error: "entity_not_found" };
  const result = await importFor(need, pageUrl, altIt ?? null, user.id, allowSa);
  for (const path of MEDIA_PATHS) revalidatePath(path, "page");
  return result;
}

// Area senza foto adatta su Commons: usa la foto vera di uno dei suoi luoghi.
async function reusePlacePhoto(areaId: string) {
  const [row] = await dbAdmin
    .select({ mediaId: places.coverMediaId })
    .from(places)
    .innerJoin(media, eq(media.id, places.coverMediaId))
    .where(
      and(
        eq(places.areaId, areaId),
        isNotNull(places.coverMediaId),
        eq(media.kind, "photo"),
        sql`public.media_is_usable(${media.id})`,
        sql`coalesce(${media.originalFilename}, '') not like 'demo-%'`,
      ),
    )
    .orderBy(sql`${places.isFeatured} desc`, sql`${places.featuredOrder} asc nulls last`, places.name)
    .limit(1);
  return row?.mediaId ?? null;
}

const autoSchema = z.object({
  skip: z.array(z.string().max(60)).max(2000),
  limit: z.number().int().min(1).max(5),
  allowSa: z.boolean().default(false),
});

// Un passo dell'assegnazione automatica: prende le prossime entità senza foto vera (tranne
// quelle già saltate) e per ognuna importa il candidato migliore. Il browser chiama di nuovo
// finché remaining è 0: ogni chiamata resta breve (poche importazioni), dentro i limiti di
// durata delle funzioni serverless.
export async function autoAssignCommonsPhotos(input: unknown): Promise<AutoAssignStep> {
  const parsed = autoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { user } = await requireAdmin();
  const skip = new Set(parsed.data.skip);
  const pending = (await entitiesNeedingPhoto()).filter((n) => !skip.has(`${n.type}:${n.id}`));
  const batch = pending.slice(0, parsed.data.limit);
  const exclude = await importedCommonsPages();

  const items: AutoAssignItem[] = [];
  for (const need of batch) {
    const base = { key: `${need.type}:${need.id}`, type: need.type, name: cleanName(need.name) };
    const search = await searchCommons(await photoTarget(need), exclude, undefined, { allowSa: parsed.data.allowSa });
    const best = search.ok ? search.candidates[0] : undefined;
    if (best) {
      const imported = await importFor(need, best.pageUrl, null, user.id, parsed.data.allowSa);
      if (imported.ok) {
        exclude.add(best.pageUrl);
        items.push({ ...base, outcome: "assigned", mediaId: imported.mediaId });
        continue;
      }
      if (need.type !== "area") {
        items.push({ ...base, outcome: "skipped", reason: imported.error ?? "failed" });
        continue;
      }
    }
    if (need.type === "area") {
      const reused = await reusePlacePhoto(need.id);
      if (reused) {
        await setCover(need, reused);
        items.push({ ...base, outcome: "reused", mediaId: reused });
        continue;
      }
    }
    items.push({
      ...base,
      outcome: "skipped",
      reason: search.ok ? "no_candidate" : search.error,
      stats: search.ok ? search.stats : undefined,
    });
  }
  for (const path of MEDIA_PATHS) revalidatePath(path, "page");
  return { ok: true, items, remaining: Math.max(0, pending.length - batch.length) };
}
