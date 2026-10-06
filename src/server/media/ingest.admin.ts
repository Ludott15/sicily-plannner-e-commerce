import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { variantPath } from "@/lib/media";
import type { EntityType } from "@/lib/media-admin";
import { dbAdmin } from "@/server/db/admin";
import { activities, areas, itineraries, media, places } from "@/server/db/schema";
import type { UploadRejection } from "@/lib/media-admin";
import { blurDataUrl, cleanMaster, inspectPhoto, inspectSvg, renderVariants } from "./images";
import { downloadObject, listObjects, removeObjects, uploadObject } from "./storage.admin";

// Acquisizione delle immagini (caricamento admin e importatore Commons). Ogni funzione qui
// è chiamata solo da azioni che hanno già fatto requireAdmin; i file vanno nello storage con
// la sessione dell'admin (policy su storage.objects), le righe con dbAdmin.

export type { EntityType };
export type EntityRef = { type: EntityType; id: string; slug: string; name: string; coverMediaId: string | null };

const CONTENT_TYPE = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

// Fonte e didascalia di un nuovo media. Per i caricamenti dell'admin sono vuote e si
// compilano nella tabella; per Commons arrivano dall'API.
export type MediaSource = {
  sourceType: "own" | "licensed" | "partner";
  altIt?: string | null;
  author?: string | null;
  authorUrl?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  sourceUrl?: string | null;
  accessedAt?: string | null;
  modified?: boolean;
};

export type IngestResult = { ok: true; mediaId: string } | { ok: false; error: UploadRejection | { code: "storage_failed" } };

async function writeVariants(id: string, version: number, master: Buffer, width: number, height: number, fx: number, fy: number) {
  const variants = await renderVariants(master, width, height, fx, fy);
  const paths: string[] = [];
  for (const v of variants) {
    const path = variantPath(id, version, v.ratio, v.width, v.format);
    await uploadObject(path, v.buffer, v.format === "avif" ? "image/avif" : "image/webp");
    paths.push(path);
  }
  return paths;
}

export async function ingestPhoto(input: Buffer, filename: string, source: MediaSource, createdBy: string): Promise<IngestResult> {
  const inspected = await inspectPhoto(input);
  if (!inspected.ok) return inspected;
  const { buffer: master, width, height } = await cleanMaster(input, inspected.photo.format);

  const id = randomUUID();
  const storagePath = `${id}/master.${inspected.photo.ext}`;
  const written: string[] = [];
  try {
    await uploadObject(storagePath, master, CONTENT_TYPE[inspected.photo.ext]);
    written.push(storagePath);
    written.push(...(await writeVariants(id, 1, master, width, height, 0.5, 0.5)));
    await dbAdmin.insert(media).values({
      id,
      storagePath,
      width,
      height,
      kind: "photo",
      sourceType: source.sourceType,
      altIt: source.altIt ?? null,
      author: source.author ?? null,
      authorUrl: source.authorUrl ?? null,
      license: source.license ?? null,
      licenseUrl: source.licenseUrl ?? null,
      sourceUrl: source.sourceUrl ?? null,
      accessedAt: source.accessedAt ?? null,
      // Le varianti sono ritagli: per le foto con licenza la modifica va sempre dichiarata.
      modified: source.sourceType === "licensed" ? true : (source.modified ?? false),
      blurDataUrl: await blurDataUrl(master),
      variantsVersion: 1,
      originalFilename: filename.slice(0, 200),
      createdBy,
    });
    return { ok: true, mediaId: id };
  } catch (error) {
    console.error("ingestPhoto", error);
    await removeObjects(written).catch(() => {});
    return { ok: false, error: { code: "storage_failed" } };
  }
}

export async function ingestSvg(input: Buffer, filename: string, createdBy: string): Promise<IngestResult> {
  const inspected = await inspectSvg(input);
  if (!inspected.ok) return inspected;
  const id = randomUUID();
  const storagePath = `${id}/illustration.svg`;
  try {
    await uploadObject(storagePath, input, "image/svg+xml");
    await dbAdmin.insert(media).values({
      id,
      storagePath,
      width: inspected.width,
      height: inspected.height,
      kind: "illustration",
      sourceType: "illustration",
      originalFilename: filename.slice(0, 200),
      createdBy,
    });
    return { ok: true, mediaId: id };
  } catch (error) {
    console.error("ingestSvg", error);
    await removeObjects([storagePath]).catch(() => {});
    return { ok: false, error: { code: "storage_failed" } };
  }
}

// Nuovo punto focale: varianti rigenerate in una nuova versione, poi quelle vecchie si
// eliminano. Il cambio di versione cambia anche gli URL, quindi nessuna cache vecchia.
export async function regenerateVariants(mediaId: string, focalX: number, focalY: number) {
  const [row] = await dbAdmin.select().from(media).where(eq(media.id, mediaId));
  if (!row || row.kind !== "photo") return false;
  const master = await downloadObject(row.storagePath);
  const version = row.variantsVersion + 1;
  const written = await writeVariants(mediaId, version, master, row.width, row.height, focalX, focalY);
  try {
    await dbAdmin
      .update(media)
      .set({ focalX, focalY, variantsVersion: version, modified: row.sourceType === "licensed" ? true : row.modified })
      .where(eq(media.id, mediaId));
  } catch (error) {
    await removeObjects(written).catch(() => {});
    throw error;
  }
  if (row.variantsVersion > 0) {
    await removeObjects(await listObjects(`${mediaId}/v${row.variantsVersion}`)).catch(() => {});
  }
  return true;
}

export async function deleteMediaFiles(mediaId: string, storagePath: string, variantsVersion: number) {
  const paths = [storagePath];
  if (variantsVersion > 0) paths.push(...(await listObjects(`${mediaId}/v${variantsVersion}`)));
  await removeObjects(paths);
}

// ---------------------------------------------------------------------------
// Entità per slug
// ---------------------------------------------------------------------------

// Le foto si abbinano a luoghi, attività e itinerari pronti; le illustrazioni alle aree.
// Uno slug presente in più tabelle è ambiguo: si segnala invece di indovinare.
export async function findEntitiesBySlug(slug: string, forIllustration: boolean): Promise<EntityRef[]> {
  if (forIllustration) {
    const rows = await dbAdmin
      .select({ id: areas.id, slug: areas.slug, name: areas.nameIt, coverMediaId: areas.coverMediaId })
      .from(areas)
      .where(eq(areas.slug, slug));
    return rows.map((r) => ({ type: "area" as const, ...r }));
  }
  const [placeRows, activityRows, itineraryRows] = await Promise.all([
    dbAdmin
      .select({ id: places.id, slug: places.slug, name: places.name, coverMediaId: places.coverMediaId })
      .from(places)
      .where(eq(places.slug, slug)),
    dbAdmin
      .select({ id: activities.id, slug: activities.slug, name: activities.title, coverMediaId: activities.coverMediaId })
      .from(activities)
      .where(eq(activities.slug, slug)),
    dbAdmin
      .select({ id: itineraries.id, slug: sql<string>`${itineraries.slug}`, name: itineraries.title, coverMediaId: itineraries.coverMediaId })
      .from(itineraries)
      .where(and(eq(itineraries.slug, slug), eq(itineraries.isTemplate, true), isNotNull(itineraries.slug))),
  ]);
  return [
    ...placeRows.map((r) => ({ type: "place" as const, ...r })),
    ...activityRows.map((r) => ({ type: "activity" as const, ...r })),
    ...itineraryRows.map((r) => ({ type: "itinerary" as const, ...r })),
  ];
}

export async function setCover(entity: Pick<EntityRef, "type" | "id">, mediaId: string | null) {
  switch (entity.type) {
    case "place":
      await dbAdmin.update(places).set({ coverMediaId: mediaId }).where(eq(places.id, entity.id));
      break;
    case "activity":
      await dbAdmin.update(activities).set({ coverMediaId: mediaId }).where(eq(activities.id, entity.id));
      break;
    case "itinerary":
      await dbAdmin
        .update(itineraries)
        .set({ coverMediaId: mediaId })
        .where(and(eq(itineraries.id, entity.id), eq(itineraries.isTemplate, true)));
      break;
    case "area":
      await dbAdmin.update(areas).set({ coverMediaId: mediaId }).where(eq(areas.id, entity.id));
      break;
  }
}
