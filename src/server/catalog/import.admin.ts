import "server-only";
import { inArray, sql } from "drizzle-orm";
import { MAX_IMPORT_ROWS, type CatalogImportColumn } from "@/lib/catalog-import/columns";
import { CsvParseError, parseCsv } from "@/lib/catalog-import/csv";
import { checkHeader, normalizeRow, type ColumnIndex, type NormalizedImportRow } from "@/lib/catalog-import/rows";
import type {
  CatalogImportFileError,
  CatalogImportPreview,
  CatalogImportResult,
  ImportIssue,
  ImportRowPreview,
  ImportRowStatus,
} from "@/lib/catalog-import/types";
import type { dbAdmin } from "@/server/db/admin";
import {
  activities,
  activityInterests,
  activitySources,
  adminAuditLog,
  areas,
  interests,
  media,
  places,
} from "@/server/db/schema";

// Importazione del catalogo da CSV (solo admin, chiamata dalle azioni in import-actions.admin.ts
// dopo requireAdmin). Ogni funzione riceve la transazione di dbAdmin: le letture sono batch
// (nessuna query nei cicli), la scrittura avviene nella stessa transazione.
// Regole: contratto di importazione (PR 2). Le attività importate nascono inattive e da
// verificare; le attive non passano a luoghi inattivi o nuovi.

// Transazione di dbAdmin: il preview gira in una transazione di sola lettura, il commit scrive
// nella stessa transazione.
export type CatalogDb = Parameters<Parameters<typeof dbAdmin.transaction>[0]>[0];

export type CatalogImportOutcome =
  | { status: "preview"; preview: CatalogImportPreview }
  | { status: "imported"; result: CatalogImportResult }
  | { status: "error"; code: CatalogImportFileError | "failed"; columns?: string[] };

type PlannedPlace = {
  slug: string;
  name: string;
  province: string;
  lat: number;
  lng: number;
  areaId: string;
  taglineIt: string | null;
};

type PlannedRow = { row: NormalizedImportRow; status: "create" | "update"; coverMediaId: string | null };

type Analysis = {
  preview: CatalogImportPreview;
  writes: PlannedRow[];
  newPlaces: PlannedPlace[];
  placeIdBySlug: Map<string, string>;
};

type AnalysisOutcome = { ok: true; analysis: Analysis } | { ok: false; error: CatalogImportFileError; columns?: string[] };

const unique = (values: string[]) => [...new Set(values)];

function fileFailure(error: CatalogImportFileError, columns?: string[]): AnalysisOutcome {
  return columns ? { ok: false, error, columns } : { ok: false, error };
}

function requireId(ids: ReadonlyMap<string, string>, key: string): string {
  const id = ids.get(key);
  // Non dovrebbe succedere: luoghi e attività vengono inseriti prima di usarne gli id.
  if (!id) throw new Error("catalog_import_id_missing");
  return id;
}

// Valore di una colonna della riga grezza (per le righe scartate, di cui manca la normalizzazione).
function cellOf(cells: string[], index: ColumnIndex, column: CatalogImportColumn): string {
  const position = index[column];
  return position === undefined ? "" : (cells[position] ?? "").trim();
}

// Il luogo esiste già: i dati del file diversi da quelli salvati non lo toccano, si segnala.
function placeDataIgnored(
  place: NormalizedImportRow["place"],
  existing: { name: string; province: string; lat: number; lng: number; areaId: string | null; taglineIt: string | null },
  areaSlugById: ReadonlyMap<string, string>,
): ImportIssue[] {
  const existingAreaSlug = existing.areaId ? areaSlugById.get(existing.areaId) : undefined;
  const differs =
    (place.name !== null && place.name !== existing.name) ||
    (place.province !== null && place.province.toUpperCase() !== existing.province.toUpperCase()) ||
    (place.lat !== null && Math.abs(place.lat - existing.lat) > 1e-6) ||
    (place.lng !== null && Math.abs(place.lng - existing.lng) > 1e-6) ||
    (place.areaSlug !== null && place.areaSlug !== existingAreaSlug) ||
    (place.taglineIt !== null && place.taglineIt !== existing.taglineIt);
  return differs ? [{ code: "place_data_ignored", value: place.slug }] : [];
}

// Un luogo nuovo si crea solo con tutti i dati obbligatori e un'area esistente.
function planNewPlace(
  place: NormalizedImportRow["place"],
  areaIdBySlug: ReadonlyMap<string, string>,
): { ok: true; place: PlannedPlace } | { ok: false; errors: ImportIssue[] } {
  const errors: ImportIssue[] = [];
  if (!place.name) errors.push({ code: "place_missing_data", column: "place_name" });
  if (place.lat === null) errors.push({ code: "place_missing_data", column: "place_lat" });
  if (place.lng === null) errors.push({ code: "place_missing_data", column: "place_lng" });
  if (!place.province) errors.push({ code: "place_missing_data", column: "place_province" });
  if (!place.areaSlug) {
    errors.push({ code: "place_missing_data", column: "area_slug" });
  } else if (!areaIdBySlug.has(place.areaSlug)) {
    errors.push({ code: "area_unknown", column: "area_slug", value: place.areaSlug });
  }
  const areaId = place.areaSlug ? areaIdBySlug.get(place.areaSlug) : undefined;
  if (errors.length > 0 || !areaId || !place.name || place.lat === null || place.lng === null || !place.province) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    place: {
      slug: place.slug,
      name: place.name,
      province: place.province,
      lat: place.lat,
      lng: place.lng,
      areaId,
      taglineIt: place.taglineIt,
    },
  };
}

// Legge il file e lo risolve con poche query batch: restituisce l'anteprima e le righe valide.
async function analyzeCatalogImport(db: CatalogDb, fileName: string, text: string): Promise<AnalysisOutcome> {
  if (text.trim() === "") return fileFailure("file_empty");

  let parsed: ReturnType<typeof parseCsv>;
  try {
    parsed = parseCsv(text);
  } catch (error) {
    if (error instanceof CsvParseError) return fileFailure("header_invalid");
    throw error;
  }

  const header = checkHeader(parsed.header);
  if (!header.ok) return fileFailure("header_invalid", [...header.missing, ...header.unknown]);
  if (parsed.rows.length === 0) return fileFailure("file_empty");
  if (parsed.rows.length > MAX_IMPORT_ROWS) return fileFailure("too_many_rows");

  const interestOptions = await db.select({ key: interests.key, labelIt: interests.labelIt }).from(interests);
  const areaRows = await db.select({ id: areas.id, slug: areas.slug }).from(areas);

  const normalized = parsed.rows.map(({ line, cells }) => ({
    line,
    cells,
    result: normalizeRow(line, cells, header.index, interestOptions),
  }));

  const placeSlugs = unique(
    normalized.flatMap(({ cells, result }) => {
      const slug = result.ok ? result.row.place.slug : cellOf(cells, header.index, "place_slug");
      return slug === "" ? [] : [slug];
    }),
  );
  const activitySlugs = unique(
    normalized.flatMap(({ result }) => {
      const slug = result.ok ? result.row.slug : result.slug;
      return slug === "" ? [] : [slug];
    }),
  );
  const imageNames = unique(
    normalized.flatMap(({ result }) => (result.ok && result.row.imageFile ? [result.row.imageFile.toLowerCase()] : [])),
  );

  const placeRows =
    placeSlugs.length === 0
      ? []
      : await db
          .select({
            id: places.id,
            slug: places.slug,
            name: places.name,
            province: places.province,
            lat: places.lat,
            lng: places.lng,
            areaId: places.areaId,
            taglineIt: places.taglineIt,
            isActive: places.isActive,
          })
          .from(places)
          .where(inArray(places.slug, placeSlugs));
  const activityRows =
    activitySlugs.length === 0
      ? []
      : await db
          .select({ id: activities.id, slug: activities.slug, isActive: activities.isActive })
          .from(activities)
          .where(inArray(activities.slug, activitySlugs));
  const lowerFileName = sql<string>`lower(${media.originalFilename})`;
  const mediaRows =
    imageNames.length === 0
      ? []
      : await db
          .select({ id: media.id, fileName: lowerFileName })
          .from(media)
          .where(inArray(lowerFileName, imageNames));

  const areaIdBySlug = new Map(areaRows.map((a) => [a.slug, a.id] as const));
  const areaSlugById = new Map(areaRows.map((a) => [a.id, a.slug] as const));
  const placeBySlug = new Map(placeRows.map((p) => [p.slug, p] as const));
  const placeIdBySlug = new Map(placeRows.map((p) => [p.slug, p.id] as const));
  const activityBySlug = new Map(activityRows.map((a) => [a.slug, a] as const));
  const mediaByName = new Map<string, string[]>();
  for (const m of mediaRows) {
    const ids = mediaByName.get(m.fileName) ?? [];
    ids.push(m.id);
    mediaByName.set(m.fileName, ids);
  }

  const seen = new Set<string>();
  const newPlaces = new Map<string, PlannedPlace>();
  const writes: PlannedRow[] = [];
  const rowPreviews: ImportRowPreview[] = [];

  for (const { line, cells, result } of normalized) {
    const slug = result.ok ? result.row.slug : result.slug;
    const title = result.ok ? result.row.title : result.title;
    const placeSlug = result.ok ? result.row.place.slug : cellOf(cells, header.index, "place_slug");
    const errors: ImportIssue[] = result.ok ? [] : [...result.errors];
    const warnings: ImportIssue[] = [];

    // Slug ripetuto nel file: vale la prima riga, le altre si scartano.
    if (seen.has(slug)) errors.push({ code: "duplicate_slug", column: "slug", value: slug });
    seen.add(slug);

    const existingActivity = activityBySlug.get(slug);
    let createsPlace = false;
    // Il luogo non è (ancora) attivo: nuovo nel file oppure già disattivato.
    let inactivePlace = false;

    if (result.ok) {
      const row = result.row;
      const existingPlace = placeBySlug.get(row.place.slug);

      if (errors.length === 0) {
        if (existingPlace) {
          warnings.push(...placeDataIgnored(row.place, existingPlace, areaSlugById));
          inactivePlace = !existingPlace.isActive;
        } else if (newPlaces.has(row.place.slug)) {
          // Stesso luogo nuovo già pianificato da una riga precedente: lo si riusa.
          inactivePlace = true;
        } else {
          const planned = planNewPlace(row.place, areaIdBySlug);
          if (!planned.ok) {
            errors.push(...planned.errors);
          } else if (existingActivity?.isActive) {
            // La riga verrà scartata (sotto): il luogo non va pianificato, altrimenti nascerebbe orfano.
            inactivePlace = true;
          } else {
            newPlaces.set(row.place.slug, planned.place);
            createsPlace = true;
            inactivePlace = true;
          }
        }
      }

      // Un'attività già attiva resta online: non può passare a un luogo inattivo o nuovo.
      if (errors.length === 0 && existingActivity?.isActive && inactivePlace) {
        errors.push({ code: "place_inactive_for_active", column: "place_slug", value: row.place.slug });
      }
    }

    // Immagine: copertina solo se il nome corrisponde a un solo media; altrimenti resta quella esistente.
    let coverMediaId: string | null = null;
    if (result.ok && result.row.imageFile) {
      const imageFile = result.row.imageFile;
      const matches = mediaByName.get(imageFile.toLowerCase()) ?? [];
      const [only] = matches;
      if (matches.length === 0) {
        warnings.push({ code: "image_not_found", column: "image_file", value: imageFile });
      } else if (matches.length > 1) {
        warnings.push({ code: "image_ambiguous", column: "image_file", value: imageFile });
      } else {
        coverMediaId = only ?? null;
      }
    }

    const status: ImportRowStatus = errors.length > 0 ? "error" : existingActivity ? "update" : "create";
    rowPreviews.push({
      line,
      slug,
      title,
      status,
      placeSlug,
      createsPlace,
      activeNow: existingActivity?.isActive === true,
      errors,
      warnings,
    });
    if (status !== "error" && result.ok) writes.push({ row: result.row, status, coverMediaId });
  }

  const totals = { create: 0, update: 0, error: 0, placesCreated: newPlaces.size };
  for (const r of rowPreviews) totals[r.status] += 1;

  return {
    ok: true,
    analysis: {
      preview: { fileName, totals, rows: rowPreviews },
      writes,
      newPlaces: [...newPlaces.values()],
      placeIdBySlug,
    },
  };
}

// Anteprima: nessuna scrittura. Il chiamante la esegue in una transazione di sola lettura.
export async function buildCatalogImportPreview(db: CatalogDb, fileName: string, text: string): Promise<CatalogImportOutcome> {
  const outcome = await analyzeCatalogImport(db, fileName, text);
  if (!outcome.ok) return { status: "error", code: outcome.error, ...(outcome.columns ? { columns: outcome.columns } : {}) };
  return { status: "preview", preview: outcome.analysis.preview };
}

// Conferma: riesegue parsing, validazione e risoluzione (il file dell'anteprima non è fidato),
// poi scrive luoghi, attività, tag, fonti e il registro in questa stessa transazione.
export async function commitCatalogImport(
  db: CatalogDb,
  actorId: string,
  fileName: string,
  text: string,
): Promise<CatalogImportOutcome> {
  const outcome = await analyzeCatalogImport(db, fileName, text);
  if (!outcome.ok) return { status: "error", code: outcome.error, ...(outcome.columns ? { columns: outcome.columns } : {}) };
  const { analysis } = outcome;
  // Nessuna riga valida: si torna all'anteprima senza scrivere nulla.
  if (analysis.writes.length === 0) return { status: "preview", preview: analysis.preview };

  const placeIdBySlug = new Map(analysis.placeIdBySlug);
  if (analysis.newPlaces.length > 0) {
    const insertedPlaces = await db
      .insert(places)
      .values(
        analysis.newPlaces.map((p) => ({
          slug: p.slug,
          name: p.name,
          province: p.province,
          lat: p.lat,
          lng: p.lng,
          areaId: p.areaId,
          taglineIt: p.taglineIt,
          isActive: false,
          needsReview: true,
        })),
      )
      .returning({ id: places.id, slug: places.slug });
    for (const p of insertedPlaces) placeIdBySlug.set(p.slug, p.id);
  }

  // Nuove: nascono inattive. Esistenti: is_active resta com'è (non è nel SET), la copertina
  // cambia solo se il file ha un'immagine trovata in modo univoco.
  const upserted = await db
    .insert(activities)
    .values(
      analysis.writes.map(({ row, coverMediaId }) => ({
        slug: row.slug,
        placeId: requireId(placeIdBySlug, row.place.slug),
        title: row.title,
        titleEn: row.titleEn,
        description: row.description,
        durationMin: row.durationMin,
        onSitePriceEur: row.onSitePriceEur,
        requiresCar: row.requiresCar,
        accessible: row.accessible,
        seasonMonths: row.seasonMonths,
        dietFriendly: row.dietFriendly,
        isActive: false,
        needsReview: true,
        coverMediaId,
      })),
    )
    .onConflictDoUpdate({
      target: activities.slug,
      set: {
        placeId: sql`excluded.place_id`,
        title: sql`excluded.title`,
        titleEn: sql`excluded.title_en`,
        description: sql`excluded.description`,
        durationMin: sql`excluded.duration_min`,
        onSitePriceEur: sql`excluded.on_site_price_eur`,
        requiresCar: sql`excluded.requires_car`,
        accessible: sql`excluded.accessible`,
        seasonMonths: sql`excluded.season_months`,
        dietFriendly: sql`excluded.diet_friendly`,
        needsReview: true,
        coverMediaId: sql`coalesce(excluded.cover_media_id, ${activities.coverMediaId})`,
      },
    })
    .returning({ id: activities.id, slug: activities.slug });
  const activityIdBySlug = new Map(upserted.map((a) => [a.slug, a.id] as const));

  // Interessi: sostituiti solo per le righe che ne hanno; le altre tengono i tag che hanno.
  const withTags = analysis.writes.filter((w) => w.row.tags.length > 0);
  if (withTags.length > 0) {
    const activityIds = withTags.map((w) => requireId(activityIdBySlug, w.row.slug));
    await db.delete(activityInterests).where(inArray(activityInterests.activityId, activityIds));
    await db.insert(activityInterests).values(
      withTags.flatMap((w) =>
        w.row.tags.map((tag) => ({
          activityId: requireId(activityIdBySlug, w.row.slug),
          interestKey: tag.key,
          strength: tag.strength,
        })),
      ),
    );
  }

  // Fonte e note: solo quando il file le indica (le altre righe lasciano quelle esistenti).
  const sourceRows = analysis.writes
    .filter((w) => w.row.sourceUrl !== null || w.row.notes !== null)
    .map((w) => ({
      activityId: requireId(activityIdBySlug, w.row.slug),
      sourceUrl: w.row.sourceUrl,
      notes: w.row.notes,
    }));
  if (sourceRows.length > 0) {
    await db
      .insert(activitySources)
      .values(sourceRows)
      .onConflictDoUpdate({
        target: activitySources.activityId,
        // Un campo vuoto nel file non cancella quello salvato.
        set: {
          sourceUrl: sql`coalesce(excluded.source_url, ${activitySources.sourceUrl})`,
          notes: sql`coalesce(excluded.notes, ${activitySources.notes})`,
          updatedAt: sql`now()`,
        },
      });
  }

  const created = analysis.writes.filter((w) => w.status === "create").map((w) => w.row.slug);
  const updated = analysis.writes.filter((w) => w.status === "update").map((w) => w.row.slug);
  const skipped = analysis.preview.rows
    .filter((r) => r.status === "error")
    .map((r) => ({ line: r.line, slug: r.slug, errors: r.errors.map((e) => e.code) }));
  const placesCreated = analysis.newPlaces.map((p) => p.slug);

  // Una sola riga di registro per l'importazione confermata.
  await db.insert(adminAuditLog).values({
    actorId,
    action: "catalog.import",
    entity: "activities",
    entityId: null,
    diff: { file: fileName, created, updated, skipped, places_created: placesCreated },
  });

  return {
    status: "imported",
    result: { created: created.length, updated: updated.length, skipped: skipped.length, placesCreated: placesCreated.length },
  };
}
