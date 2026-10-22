"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type {
  CandidateSearch,
  AutoAssignStep,
  PhotoCandidate,
  PhotoImport,
} from "@/lib/media-admin";
import { requireAdmin } from "@/server/auth";
import { entitiesNeedingPhoto, importedCommonsPages } from "./admin-queries.admin";
import { fillCommonsPhotos, importChosenFiles, importFile } from "./commons-fill.admin";
import chosenJson from "../../../content/media/commons-scelte.json";
import { CHOSEN_BATCH_SIZE, chosenPhotosSchema, chosenStepSchema, nextChosenOffset, type ChosenItemResult } from "@/lib/media-chosen";
import { cleanName, photoTarget } from "./commons-target";
import { commonsFileTitle, fetchCommonsFile } from "./commons";
import { searchCommons, type CommonsCandidate } from "./commons-search";
import { findWikipediaPhoto } from "./wiki-images";

// Foto vere da Wikimedia Commons per le entità che non ne hanno (docs/IMMAGINI.md, "Foto da
// Commons"): ricerca per posizione e per nome, importazione con gli stessi controlli
// dell'importatore (licenza, dimensioni, download da upload.wikimedia.org, EXIF rimosso).
// La logica dell'assegnazione automatica sta in commons-fill.admin.ts (condivisa con lo script).
// Zod → requireAdmin → scrittura, come le altre azioni dell'admin.

const MEDIA_PATHS = ["/[locale]/admin/media", "/[locale]/admin/media/foto-commons"] as const;
const entitySchema = z.object({
  type: z.enum(["area", "place", "activity", "itinerary"]),
  id: z.uuid(),
  // CC BY-SA ammessa solo se l'admin la abilita esplicitamente (docs/IMMAGINI.md, Licenze).
  allowSa: z.boolean().default(false),
});

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
  const exclude = await importedCommonsPages();
  // Prima la foto principale di Wikipedia/Wikidata, poi le alternative della ricerca su Commons.
  const wiki = await findWikipediaPhoto({ name: cleanName(need.name), placeName: need.placeName, lat: need.lat, lng: need.lng }, exclude, { allowSa });
  const wikiCandidate: PhotoCandidate[] = wiki.ok ? [{ ...toView({ ...wiki.file, previewUrl: wiki.file.downloadUrl, score: 100, matched: [] }) }] : [];
  const result = await searchCommons(photoTarget(need), exclude, undefined, { allowSa });
  if (!result.ok) {
    if (wikiCandidate.length > 0) return { ok: true, candidates: wikiCandidate, stats: { found: 1, license: 0, small: 0, other: 0, unfit: 0 } };
    return result;
  }
  const others = result.candidates.filter((c) => !wiki.ok || c.pageUrl !== wiki.file.pageUrl).slice(0, 7).map(toView);
  return { ok: true, candidates: [...wikiCandidate, ...others], stats: result.stats };
}

const importSchema = entitySchema.extend({
  pageUrl: z.string().url().refine((u) => commonsFileTitle(u) !== null),
  altIt: z.string().trim().max(300).optional(),
});

// Importa una pagina di Commons scelta dall'admin e la mette come copertina. I metadati si rileggono
// dal server: dal browser arriva solo l'indirizzo della pagina.
export async function importCommonsForEntity(input: unknown): Promise<PhotoImport> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { user } = await requireAdmin();
  const { type, id, pageUrl, altIt, allowSa } = parsed.data;
  const [need] = await entitiesNeedingPhoto(1, { type, id });
  if (!need) return { ok: false, error: "entity_not_found" };
  const fetched = await fetchCommonsFile(pageUrl, undefined, { allowSa });
  if (!fetched.ok) return { ok: false, error: fetched.error, detail: "detail" in fetched ? fetched.detail : undefined };
  const result = await importFile(need, fetched.file, altIt ?? null, user.id);
  for (const path of MEDIA_PATHS) revalidatePath(path, "page");
  return result;
}

const autoSchema = z.object({
  skip: z.array(z.string().max(60)).max(2000),
  limit: z.number().int().min(1).max(5),
  allowSa: z.boolean().default(false),
});

// Un passo dell'assegnazione automatica (vedi fillCommonsPhotos): il browser richiama finché remaining è 0.
// Ogni chiamata resta breve (poche entità), dentro i limiti di durata delle funzioni serverless.
export async function autoAssignCommonsPhotos(input: unknown): Promise<AutoAssignStep> {
  const parsed = autoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { user } = await requireAdmin();
  const step = await fillCommonsPhotos({
    skip: new Set(parsed.data.skip),
    limit: parsed.data.limit,
    allowSa: parsed.data.allowSa,
    userId: user.id,
  });
  for (const path of MEDIA_PATHS) revalidatePath(path, "page");
  return { ok: true, items: step.items, remaining: step.remaining };
}

// Foto scelte dalla redazione (content/media/commons-scelte.json): un lotto di CHOSEN_BATCH_SIZE voci per
// passo, dal browser fino a next === null. Idempotente: le entità già coperte non vengono toccate.
// Il file è nel bundle del server; la scrittura usa la sessione dell'admin (sessionStorage).
export type ChosenStep =
  | { ok: true; results: ChosenItemResult[]; next: number | null; total: number }
  | { ok: false; error: "invalid" | "file_invalid" };

export async function importChosenPhotos(input: unknown): Promise<ChosenStep> {
  const parsed = chosenStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { user } = await requireAdmin();
  const all = chosenPhotosSchema.safeParse(chosenJson);
  if (!all.success) return { ok: false, error: "file_invalid" };
  const offset = parsed.data.offset;
  const batch = all.data.slice(offset, offset + CHOSEN_BATCH_SIZE);
  // Slug del file senza prefisso: in produzione le entità hanno gli slug reali.
  const { results } = await importChosenFiles(batch, { slugPrefix: "", userId: user.id });
  for (const path of MEDIA_PATHS) revalidatePath(path, "page");
  return { ok: true, results, next: nextChosenOffset(offset, batch.length, all.data.length), total: all.data.length };
}
