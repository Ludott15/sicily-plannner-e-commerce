import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { AutoAssignItem, CommonsFile, PhotoImport } from "@/lib/media-admin";
import { dbAdmin } from "@/server/db/admin";
import { media, places } from "@/server/db/schema";
import { listImportedCommonsPages, listPhotoNeeds, type PhotoNeed } from "./admin-queries.admin";
import { downloadCommonsFile, fetchCommonsFile } from "./commons";
import { keywords, scoreCandidate, searchCommons } from "./commons-search";
import { cleanName, isPertinent, photoTarget } from "./commons-target";
import { ingestPhoto, setCover } from "./ingest.admin";
import { findWikipediaPhoto } from "./wiki-images";

// Assegnazione automatica delle foto da Wikimedia Commons (docs/IMMAGINI.md, "Foto da Commons").
// La usano l'azione dell'admin (commons-actions.admin.ts, dopo requireAdmin) e lo script locale
// npm run media:commons-fill. Qui non c'è controllo di accesso: chi chiama lo verifica.
// Con userId null è una simulazione: nessuna scrittura, solo la scelta della foto.

export type FillSource = "wikipedia" | "commons" | "area_reuse";

export type FillItem = AutoAssignItem & {
  // Foto scelta (anche in simulazione): la pagina su Commons, la licenza e da dove viene.
  candidate?: { pageUrl: string; title: string; license: string | null; score: number | null; source: FillSource };
};

export type FillOptions = {
  // Chiavi "tipo:id" già elaborate (da saltare).
  skip: ReadonlySet<string>;
  limit: number;
  // CC BY-SA solo su scelta esplicita dell'admin (docs/IMMAGINI.md, Licenze).
  allowSa: boolean;
  // Autore dei media importati. Null: simulazione, nessuna scrittura.
  userId: string | null;
};

export type FillStep = { items: FillItem[]; remaining: number; dryRun: boolean };

type Choice = { file: CommonsFile; source: "wikipedia" | "commons"; article?: string; score: number | null };

type Chosen = { ok: true; choice: Choice } | { ok: false; reason: string; detail?: string };

// Cerca la foto migliore: prima la foto principale di Wikipedia/Wikidata, poi (solo luoghi e attività)
// la ricerca su Commons con il controllo di pertinenza.
async function chooseFile(need: PhotoNeed, exclude: ReadonlySet<string>, allowSa: boolean): Promise<Chosen> {
  const name = cleanName(need.name);
  const wiki = await findWikipediaPhoto({ name, placeName: need.placeName, lat: need.lat, lng: need.lng }, exclude, { allowSa });
  // Un'attività vale la foto di Wikipedia solo se il file stesso riguarda l'attività: la voce di un tema
  // generico ("Ceramica" per il museo di Caltagirone) porta una foto che non c'entra.
  const wikiFits = wiki.ok && (need.type !== "activity" || isPertinent(need, { matched: scoreCandidate(wiki.file, keywords(name), false).matched }));
  if (wiki.ok && wikiFits) return { ok: true, choice: { file: wiki.file, source: "wikipedia", article: wiki.article, score: null } };
  const wikiDetail = wiki.ok ? `voce ${wiki.article}: file non pertinente` : [wiki.article, wiki.detail].filter(Boolean).join(" · ") || undefined;
  if (need.type !== "place" && need.type !== "activity") return { ok: false, reason: wiki.ok ? "wiki_not_suitable" : `wiki_${wiki.reason}`, detail: wikiDetail };

  const found = await searchCommons(photoTarget(need), exclude, undefined, { allowSa });
  if (!found.ok) return { ok: false, reason: found.error, detail: found.detail ?? wikiDetail };
  const best = found.candidates.find((candidate) => isPertinent(need, candidate));
  if (!best) return { ok: false, reason: "no_candidate", detail: wikiDetail };
  return { ok: true, choice: { file: best, source: "commons", score: best.score } };
}

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}

// La copertina di un'altra entità non si riassegna: la foto di quell'entità è già una foto vera.
async function isCoverOfAnother(mediaId: string, need: PhotoNeed): Promise<boolean> {
  const owners = await dbAdmin.execute<{ type: string; id: string }>(sql`
    select 'area' as type, id from public.areas where cover_media_id = ${mediaId}
    union all select 'place', id from public.places where cover_media_id = ${mediaId}
    union all select 'activity', id from public.activities where cover_media_id = ${mediaId}
    union all select 'itinerary', id from public.itineraries where cover_media_id = ${mediaId}
  `);
  return [...owners].some((owner) => owner.type !== need.type || owner.id !== need.id);
}

// Importa un file di Commons già letto dal server (metadati controllati da parseCommonsResponse) e lo
// mette come copertina dell'entità. Se la pagina è già un media, si riusa solo se non è di un'altra entità.
export async function importFile(need: PhotoNeed, file: CommonsFile, altIt: string | null, userId: string): Promise<PhotoImport> {
  const [existing] = await dbAdmin.select({ id: media.id }).from(media).where(eq(media.sourceUrl, file.pageUrl || "-"));
  if (existing) {
    if (await isCoverOfAnother(existing.id, need)) return { ok: false, error: "already_imported" };
    await setCover(need, existing.id);
    return { ok: true, mediaId: existing.id };
  }
  const downloaded = await downloadCommonsFile(file.downloadUrl);
  if (!downloaded.ok) return { ok: false, error: downloaded.error, detail: downloaded.detail };
  const alt = (altIt?.trim() || file.description || cleanName(need.name)).slice(0, 300);
  const ingested = await ingestPhoto(
    downloaded.body,
    file.title.replace(/^File:/, ""),
    {
      sourceType: "licensed",
      altIt: alt,
      author: file.author,
      authorUrl: file.authorUrl,
      license: file.license,
      licenseUrl: file.licenseUrl,
      sourceUrl: file.pageUrl || null,
      accessedAt: today(),
      modified: true,
    },
    userId,
  );
  if (!ingested.ok) return { ok: false, error: ingested.error.code };
  await setCover(need, ingested.mediaId);
  return { ok: true, mediaId: ingested.mediaId };
}

// Area senza foto adatta su Commons: usa la foto vera di uno dei suoi luoghi.
async function reusePlacePhoto(areaId: string): Promise<string | null> {
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

const skipped = (base: Pick<FillItem, "key" | "type" | "name">, reason: string, detail?: string): FillItem => ({
  ...base,
  outcome: "skipped",
  reason,
  detail,
});

async function decide(need: PhotoNeed, state: { exclude: Set<string>; allowSa: boolean; userId: string | null }): Promise<FillItem> {
  const base = { key: `${need.type}:${need.id}`, type: need.type, name: cleanName(need.name) };
  const userId = state.userId;
  const chosen = await chooseFile(need, state.exclude, state.allowSa);

  let importReason: string | undefined;
  if (chosen.ok) {
    const { file, source, article, score } = chosen.choice;
    const candidate = { pageUrl: file.pageUrl, title: file.title, license: file.license, score, source };
    if (userId === null) {
      state.exclude.add(file.pageUrl);
      return { ...base, outcome: "assigned", detail: article, candidate };
    }
    const imported = await importFile(need, file, null, userId);
    if (imported.ok) {
      state.exclude.add(file.pageUrl);
      return { ...base, outcome: "assigned", mediaId: imported.mediaId, detail: article, candidate };
    }
    importReason = imported.error ?? "import_failed";
    if (need.type !== "area") return skipped(base, importReason, imported.detail);
  }

  if (need.type === "area") {
    const reused = await reusePlacePhoto(need.id);
    if (reused) {
      if (userId !== null) await setCover(need, reused);
      return { ...base, outcome: "reused", mediaId: reused };
    }
  }
  if (chosen.ok) return skipped(base, importReason ?? "import_failed");
  return skipped(base, chosen.reason, chosen.detail);
}

// Un passo: le prossime entità senza foto vera (tranne quelle già elaborate) e il candidato migliore per
// ognuna. Il chiamante richiama finché remaining è 0. Ordine: luoghi, attività, itinerari, aree.
export async function fillCommonsPhotos(options: FillOptions): Promise<FillStep> {
  const pending = (await listPhotoNeeds()).filter((need) => !options.skip.has(`${need.type}:${need.id}`));
  const batch = pending.slice(0, options.limit);
  const exclude = await listImportedCommonsPages();
  const state = { exclude: new Set(exclude), allowSa: options.allowSa, userId: options.userId };
  const items: FillItem[] = [];
  for (const need of batch) items.push(await decide(need, state));
  return { items, remaining: Math.max(0, pending.length - batch.length), dryRun: options.userId === null };
}

// File scelti a mano (content/media/commons-scelte.json): si importa esattamente quel file, con le stesse
// verifiche dell'importatore (licenza, autore, lato lungo) e la stessa assegnazione di copertina.
// Idempotente: un'entità già coperta non viene toccata, quindi un secondo passaggio non reimporta nulla.
// allow_sa: CC BY-SA ammessa per questa sola voce (scelta esplicita, docs/IMMAGINI.md). NC e ND restano escluse.
export type ChosenEntry = { type: "activity" | "place"; slug: string; file: string; motivo: string; alt_it: string; allow_sa?: boolean };

export type ChosenResult = {
  type: ChosenEntry["type"];
  slug: string;
  file: string;
  outcome: "assigned" | "already_imported" | "rejected" | "not_needed";
  reason?: string;
  license?: string | null;
  mediaId?: string;
};

export async function importChosenFiles(
  entries: readonly ChosenEntry[],
  options: { slugPrefix: string; userId: string | null },
): Promise<{ results: ChosenResult[]; remaining: PhotoNeed[] }> {
  const needs = await listPhotoNeeds();
  const done = new Set<string>();
  const results: ChosenResult[] = [];
  for (const entry of entries) {
    const base = { type: entry.type, slug: entry.slug, file: entry.file };
    const slug = options.slugPrefix + entry.slug;
    const need = needs.find((n) => n.type === entry.type && n.slug === slug && !done.has(`${n.type}:${n.id}`));
    if (!need) {
      results.push({ ...base, outcome: "not_needed", reason: "nessuna foto da assegnare (già coperta, o slug non trovato)" });
      continue;
    }
    const name = entry.file.replace(/^File:/, "").replace(/ /g, "_");
    const fetched = await fetchCommonsFile(`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name)}`, undefined, { allowSa: entry.allow_sa === true });
    if (!fetched.ok) {
      results.push({ ...base, outcome: "rejected", reason: "detail" in fetched && fetched.detail ? `${fetched.error}: ${fetched.detail}` : fetched.error });
      continue;
    }
    if (options.userId === null) {
      const [existing] = await dbAdmin.select({ id: media.id }).from(media).where(eq(media.sourceUrl, fetched.file.pageUrl || "-"));
      // Stessa regola della simulazione reale: un media già copertina di un'altra entità non si riassegna.
      if (existing && (await isCoverOfAnother(existing.id, need))) {
        results.push({ ...base, outcome: "rejected", reason: "già copertina di un'altra entità", license: fetched.file.license, mediaId: existing.id });
        continue;
      }
      results.push({ ...base, outcome: existing ? "already_imported" : "assigned", license: fetched.file.license, mediaId: existing?.id });
      if (!existing) done.add(`${need.type}:${need.id}`);
      continue;
    }
    const imported = await importFile(need, fetched.file, entry.alt_it, options.userId);
    if (imported.ok) {
      done.add(`${need.type}:${need.id}`);
      results.push({ ...base, outcome: "assigned", license: fetched.file.license, mediaId: imported.mediaId });
    } else {
      results.push({ ...base, outcome: "rejected", reason: imported.error ?? "import_failed" });
    }
  }
  const remaining = needs.filter((n) => (n.type === "activity" || n.type === "place") && !done.has(`${n.type}:${n.id}`));
  return { results, remaining };
}
