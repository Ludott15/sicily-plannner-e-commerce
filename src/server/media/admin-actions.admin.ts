"use server";

import { randomUUID } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AdminErrorCode, AdminFormState } from "@/lib/admin-form";
import { MAX_UPLOAD_BYTES, PHOTO_MIME, SVG_MIME, parseUploadName } from "@/lib/media";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { imageAuthorizations, media } from "@/server/db/schema";
import type {
  CommonsImportResult,
  CommonsPreviewRow,
  CoverState,
  EntityMatch,
  PreparedUpload,
  ProcessedUpload,
} from "@/lib/media-admin";
import { downloadCommonsFile, fetchCommonsFile, parseImportLines } from "./commons";
import {
  deleteMediaFiles,
  findEntitiesBySlug,
  ingestPhoto,
  ingestSvg,
  regenerateVariants,
  setCover,
  type EntityRef,
  type EntityType,
} from "./ingest.admin";
import { createUploadUrl, downloadObject, removeObjects } from "./storage.admin";

// Azioni dell'admin delle immagini: Zod → requireAdmin → scrittura (dbAdmin per le righe,
// storage con la sessione dell'admin per i file). Le pagine pubbliche leggono con la RLS.

const ADMIN_MEDIA_PATH = "/[locale]/admin/media";

function today() {
  // Data italiana: accessed_at è "oggi" per chi importa.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}


async function matchEntity(slug: string | null, forIllustration: boolean): Promise<{ match: EntityMatch; entity?: EntityRef }> {
  if (!slug) return { match: { ok: false, error: "unmatched_name" } };
  const found = await findEntitiesBySlug(slug, forIllustration);
  if (found.length === 0) return { match: { ok: false, error: "entity_not_found" } };
  if (found.length > 1) return { match: { ok: false, error: "entity_ambiguous" } };
  const entity = found[0]!;
  return { match: { ok: true, entity: { type: entity.type, name: entity.name, slug: entity.slug } }, entity };
}

// ---------------------------------------------------------------------------
// Caricamento multiplo
// ---------------------------------------------------------------------------

const ACCEPTED = new Set<string>([...PHOTO_MIME, SVG_MIME]);
const uploadListSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(200),
      size: z.number().int().positive(),
      type: z.string().max(100),
    }),
  )
  .min(1)
  .max(30);

// Primo passo: controlla nomi, tipi e dimensioni dichiarati e restituisce un URL firmato per
// ogni file. Il controllo vero sul contenuto lo fa processMediaUpload.
export async function prepareMediaUploads(files: unknown): Promise<PreparedUpload[] | { error: "invalid" }> {
  const parsed = uploadListSchema.safeParse(files);
  if (!parsed.success) return { error: "invalid" };
  await requireAdmin();

  const result: PreparedUpload[] = [];
  for (const file of parsed.data) {
    const parsedName = parseUploadName(file.name);
    const ext = parsedName?.ext ?? /\.(jpe?g|png|webp|svg)$/i.exec(file.name)?.[1]?.toLowerCase().replace("jpeg", "jpg");
    if (file.size > MAX_UPLOAD_BYTES) {
      result.push({ name: file.name, ok: false, error: "too_large" });
      continue;
    }
    if (!ACCEPTED.has(file.type) || !ext) {
      result.push({ name: file.name, ok: false, error: "unsupported_type" });
      continue;
    }
    const { match } = await matchEntity(parsedName?.slug ?? null, ext === "svg");
    const path = `incoming/${randomUUID()}.${ext}`;
    result.push({ name: file.name, ok: true, path, uploadUrl: await createUploadUrl(path), match });
  }
  return result;
}

const processSchema = z.object({
  path: z.string().regex(/^incoming\/[0-9a-f-]{36}\.(jpg|png|webp|svg)$/),
  name: z.string().trim().min(1).max(200),
});

// Secondo passo, un file alla volta: legge il file caricato in incoming/, lo valida dal
// contenuto, salva originale ripulito e varianti, cancella il caricamento grezzo (con l'EXIF)
// e, se il nome corrisponde a un'entità senza copertina, ne fa la copertina.
export async function processMediaUpload(input: unknown): Promise<ProcessedUpload> {
  const parsed = processSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: "invalid" } };
  const { user } = await requireAdmin();
  const { path, name } = parsed.data;
  const isSvg = path.endsWith(".svg");

  let raw: Buffer;
  try {
    raw = await downloadObject(path);
  } catch {
    return { ok: false, error: { code: "storage_failed" } };
  }
  try {
    const ingested = isSvg ? await ingestSvg(raw, name, user.id) : await ingestPhoto(raw, name, { sourceType: "own" }, user.id);
    if (!ingested.ok) return ingested;

    const { match, entity } = await matchEntity(parseUploadName(name)?.slug ?? null, isSvg);
    let becameCover = false;
    if (entity && entity.coverMediaId === null) {
      await setCover(entity, ingested.mediaId);
      becameCover = true;
    }
    revalidatePath(ADMIN_MEDIA_PATH, "page");
    return { ok: true, mediaId: ingested.mediaId, match, becameCover };
  } finally {
    await removeObjects([path]).catch((error) => console.error("incoming non rimosso", path, error));
  }
}

// ---------------------------------------------------------------------------
// Dati di un media (tabella e scheda)
// ---------------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));
const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.url({ protocol: /^https?$/ }).max(500).nullable());
const optionalHttpsUrl = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.url({ protocol: /^https$/ }).max(500).nullable());
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on");
const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

const mediaSchema = z.object({
  id: z.uuid(),
  altIt: optionalText(300),
  altEn: optionalText(300),
  sourceType: z.enum(["own", "licensed", "partner", "illustration"]),
  author: optionalText(200),
  authorUrl: optionalUrl,
  license: optionalText(120),
  licenseUrl: optionalUrl,
  sourceUrl: optionalHttpsUrl,
  modified: checkbox,
  heritageAsset: checkbox,
  authorizationId: optionalUuid,
});

export async function saveMediaDetails(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = mediaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  const values = parsed.data;
  // Autore e licenza obbligatori per foto proprie, con licenza e dei partner.
  if (values.sourceType !== "illustration" && (!values.author || !values.license)) {
    return { status: "error", code: "author_license_required" };
  }
  if (values.heritageAsset && !values.authorizationId) return { status: "error", code: "heritage_without_authorization" };
  await requireAdmin();

  try {
    const [row] = await dbAdmin.select({ storagePath: media.storagePath }).from(media).where(eq(media.id, values.id));
    if (!row) return { status: "error", code: "invalid" };
    const isSvg = row.storagePath.endsWith(".svg");
    if (isSvg !== (values.sourceType === "illustration")) return { status: "error", code: "svg_must_be_illustration" };
    if (values.authorizationId) {
      const [authorization] = await dbAdmin
        .select({ id: imageAuthorizations.id })
        .from(imageAuthorizations)
        .where(and(eq(imageAuthorizations.id, values.authorizationId), gte(imageAuthorizations.validUntil, today())));
      if (!authorization) return { status: "error", code: "authorization_expired" };
    }
    const { id, ...fields } = values;
    await dbAdmin
      .update(media)
      .set({
        ...fields,
        kind: fields.sourceType === "illustration" ? "illustration" : "photo",
        // Per le illustrazioni la didascalia è fissa: niente autore né licenza.
        ...(fields.sourceType === "illustration" ? { author: null, authorUrl: null, license: null, licenseUrl: null } : {}),
        modified: fields.sourceType === "licensed" ? true : fields.modified,
        authorizationId: fields.heritageAsset ? fields.authorizationId : null,
      })
      .where(eq(media.id, id));
  } catch (error) {
    console.error("saveMediaDetails", error);
    return { status: "error", code: "failed" };
  }
  // Una riga completata esce da "Da completare": è il segnale che l'immagine è pubblicabile.
  revalidatePath(ADMIN_MEDIA_PATH, "page");
  revalidatePath(`${ADMIN_MEDIA_PATH}/[id]`, "page");
  return { status: "saved" };
}

const focalSchema = z.object({
  id: z.uuid(),
  x: z.coerce.number().min(0).max(1),
  y: z.coerce.number().min(0).max(1),
});

export async function setMediaFocalPoint(input: unknown): Promise<{ ok: boolean }> {
  const parsed = focalSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  await requireAdmin();
  const { id, x, y } = parsed.data;
  const ok = await regenerateVariants(id, Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000).catch((error) => {
    console.error("setMediaFocalPoint", error);
    return false;
  });
  revalidatePath(`${ADMIN_MEDIA_PATH}/[id]`, "page");
  return { ok };
}

const coverSchema = z.object({
  mediaId: z.uuid(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export async function setMediaCover(_prev: CoverState, formData: FormData): Promise<CoverState> {
  const parsed = coverSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", error: "unmatched_name" };
  await requireAdmin();
  const [row] = await dbAdmin.select({ kind: media.kind }).from(media).where(eq(media.id, parsed.data.mediaId));
  if (!row) return { status: "error", error: "entity_not_found" };
  const { match, entity } = await matchEntity(parsed.data.slug, row.kind === "illustration");
  if (!match.ok || !entity) return { status: "error", error: match.ok ? "entity_not_found" : match.error };
  await setCover(entity, parsed.data.mediaId);
  revalidatePath(`${ADMIN_MEDIA_PATH}/[id]`, "page");
  return { status: "saved" };
}

const unsetCoverSchema = z.object({ type: z.enum(["place", "activity", "itinerary", "area"]), id: z.uuid() });

export async function removeMediaCover(formData: FormData) {
  const parsed = unsetCoverSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await requireAdmin();
  await setCover({ type: parsed.data.type as EntityType, id: parsed.data.id }, null);
  revalidatePath(`${ADMIN_MEDIA_PATH}/[id]`, "page");
}

export async function deleteMedia(formData: FormData): Promise<{ ok: boolean }> {
  const parsed = z.object({ id: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false };
  await requireAdmin();
  const [row] = await dbAdmin.select().from(media).where(eq(media.id, parsed.data.id));
  if (!row) return { ok: false };
  // Prima la riga (le copertine tornano null e la catena di ripiego prende il posto), poi i file.
  await dbAdmin.delete(media).where(eq(media.id, row.id));
  await deleteMediaFiles(row.id, row.storagePath, row.variantsVersion).catch((error) => console.error("deleteMedia", error));
  revalidatePath(ADMIN_MEDIA_PATH, "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Autorizzazioni per i beni culturali
// ---------------------------------------------------------------------------

const authorizationSchema = z
  .object({
    id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
    authority: z.string().trim().min(1).max(200),
    reference: z.string().trim().min(1).max(200),
    issuedOn: z.iso.date(),
    validUntil: z.iso.date(),
    scope: z.string().trim().min(1).max(1000),
    documentUrl: optionalHttpsUrl,
  })
  .refine((v) => v.validUntil >= v.issuedOn);

export async function saveAuthorization(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = authorizationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  await requireAdmin();
  const { id, ...values } = parsed.data;
  try {
    if (id) await dbAdmin.update(imageAuthorizations).set(values).where(eq(imageAuthorizations.id, id));
    else await dbAdmin.insert(imageAuthorizations).values(values);
  } catch (error) {
    console.error("saveAuthorization", error);
    return { status: "error", code: "failed" };
  }
  revalidatePath(`${ADMIN_MEDIA_PATH}/autorizzazioni`, "page");
  return { status: "saved" };
}

export async function deleteAuthorization(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = z.object({ id: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  await requireAdmin();
  try {
    await dbAdmin.delete(imageAuthorizations).where(eq(imageAuthorizations.id, parsed.data.id));
  } catch (error) {
    const code = (error as { cause?: { code?: string } })?.cause?.code;
    return { status: "error", code: (code === "23503" ? "authorization_in_use" : "failed") satisfies AdminErrorCode };
  }
  revalidatePath(`${ADMIN_MEDIA_PATH}/autorizzazioni`, "page");
  return { status: "saved" };
}

// ---------------------------------------------------------------------------
// Importatore Wikimedia Commons
// ---------------------------------------------------------------------------


const importTextSchema = z.string().max(20_000);
const MAX_LINES = 30;

async function buildPreview(text: string): Promise<CommonsPreviewRow[]> {
  const rows: CommonsPreviewRow[] = [];
  for (const { line, slug, url } of parseImportLines(text).slice(0, MAX_LINES)) {
    if (!slug || !url) {
      rows.push({ line, slug, match: null, file: null, error: "invalid_line" });
      continue;
    }
    const { match } = await matchEntity(slug, false);
    // In sequenza, per non martellare l'API di Wikimedia.
    const fetched = await fetchCommonsFile(url);
    if (!fetched.ok) {
      rows.push({ line, slug, match, file: null, error: fetched.error });
      continue;
    }
    const [existing] = await dbAdmin
      .select({ id: media.id })
      .from(media)
      .where(eq(media.sourceUrl, fetched.file.pageUrl || "-"));
    rows.push({
      line,
      slug,
      match,
      file: fetched.file,
      error: existing ? "already_imported" : match.ok ? null : match.error,
    });
  }
  return rows;
}

export async function previewCommonsImport(text: unknown): Promise<{ rows: CommonsPreviewRow[] } | { error: "invalid" }> {
  const parsed = importTextSchema.safeParse(text);
  if (!parsed.success) return { error: "invalid" };
  await requireAdmin();
  return { rows: await buildPreview(parsed.data) };
}

const confirmSchema = z.object({
  text: importTextSchema,
  alts: z.record(z.string().regex(/^\d+$/), z.string().trim().max(300)),
});


// Conferma: i metadati si rileggono dal server (mai fidarsi di quelli dell'anteprima mandati
// dal browser); dal browser arrivano solo le righe e i testi alternativi rivisti.
export async function confirmCommonsImport(input: unknown): Promise<{ results: CommonsImportResult[] } | { error: "invalid" }> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const { user } = await requireAdmin();

  const results: CommonsImportResult[] = [];
  for (const row of await buildPreview(parsed.data.text)) {
    if (row.error || !row.file || !row.slug) {
      results.push({ line: row.line, ok: false, error: row.error ?? "invalid_line" });
      continue;
    }
    const downloaded = await downloadCommonsFile(row.file.downloadUrl);
    if (!downloaded.ok) {
      results.push({ line: row.line, ok: false, error: downloaded.error });
      continue;
    }
    const alt = parsed.data.alts[String(row.line)]?.trim() || null;
    const ingested = await ingestPhoto(
      downloaded.body,
      row.file.title.replace(/^File:/, ""),
      {
        sourceType: "licensed",
        altIt: alt,
        author: row.file.author,
        authorUrl: row.file.authorUrl,
        license: row.file.license,
        licenseUrl: row.file.licenseUrl,
        sourceUrl: row.file.pageUrl || null,
        accessedAt: today(),
        modified: true,
      },
      user.id,
    );
    if (!ingested.ok) {
      results.push({ line: row.line, ok: false, error: ingested.error.code });
      continue;
    }
    const { entity } = await matchEntity(row.slug, false);
    let becameCover = false;
    if (entity && entity.coverMediaId === null) {
      await setCover(entity, ingested.mediaId);
      becameCover = true;
    }
    results.push({ line: row.line, ok: true, mediaId: ingested.mediaId, becameCover });
  }
  revalidatePath(ADMIN_MEDIA_PATH, "page");
  return { results };
}
