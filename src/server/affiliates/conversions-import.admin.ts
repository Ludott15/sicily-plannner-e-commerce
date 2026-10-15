import "server-only";
import { inArray, sql } from "drizzle-orm";
import { checkConversionHeader, normalizeConversionRow, type NormalizedConversion } from "@/lib/affiliate-conversions/rows";
import {
  MAX_CONVERSION_ROWS,
  PREVIEW_ROW_LIMIT,
  type ConversionFileError,
  type ConversionImportOutcome,
  type ConversionImportPreview,
  type ConversionImportResult,
  type ConversionIssue,
  type ConversionRow,
  type ConversionRowPreview,
  type ConversionSource,
} from "@/lib/affiliate-conversions/types";
import { CsvParseError, parseCsv, type CsvDocument } from "@/lib/catalog-import/csv";
import type { dbAdmin } from "@/server/db/admin";
import { adminAuditLog, affiliateClicks, affiliateConversions } from "@/server/db/schema";

// Import delle conversioni affiliate (passo 3.3): anteprima e conferma dal CSV dell'admin, e la
// scrittura condivisa con il cron degli adattatori API. Ogni funzione riceve la transazione di
// dbAdmin. Le letture sono batch (una query per tabella, nessuna query nei cicli), la scrittura è un
// solo INSERT ... ON CONFLICT (partner, external_id) DO UPDATE: l'import è idempotente.

export type ConversionDb = Parameters<Parameters<typeof dbAdmin.transaction>[0]>[0];

export type ConversionApplyResult = { created: number; updated: number; skipped: number };

// Riga prima della decisione: se row è null la riga è scartata e errors dice perché.
type Candidate = {
  line: number;
  partner: string;
  subid: string;
  externalId: string;
  // Vero se l'id del report l'ha calcolato il server (CSV senza external_id).
  externalIdComputed: boolean;
  row: ConversionRow | null;
  errors: ConversionIssue[];
};

type Write = { row: ConversionRow; status: "create" | "update" };

type Analysis = { preview: ConversionImportPreview; writes: Write[] };

type Failure = { ok: false; outcome: ConversionImportOutcome };

type Analyzed = { ok: true; analysis: Analysis } | Failure;

const keyOf = (partner: string, externalId: string): string => `${partner}|${externalId}`;

function failure(code: ConversionFileError, columns?: string[]): Failure {
  return columns === undefined
    ? { ok: false, outcome: { status: "error", code } }
    : { ok: false, outcome: { status: "error", code, columns } };
}

// Riga letta dal CSV o dall'API. externalIdComputed è vero se l'id del report l'ha calcolato il server.
type Entry = { result: NormalizedConversion; externalIdComputed: boolean };

function candidateOf({ result, externalIdComputed }: Entry): Candidate {
  if (result.ok) {
    return {
      line: result.line,
      partner: result.row.partner,
      subid: result.row.subid,
      externalId: result.row.externalId,
      externalIdComputed,
      row: result.row,
      errors: [],
    };
  }
  return {
    line: result.line,
    partner: result.partner,
    subid: result.subid,
    externalId: result.externalId,
    externalIdComputed,
    row: null,
    errors: result.errors,
  };
}

// Conversioni già salvate tra quelle del file: una query sulle coppie (partner, external_id).
async function findExistingKeys(db: ConversionDb, rows: readonly ConversionRow[]): Promise<Set<string>> {
  if (rows.length === 0) return new Set();
  const pairs = rows.map((row) => sql`(${row.partner}::public.partner, ${row.externalId})`);
  const found = await db
    .select({ partner: affiliateConversions.partner, externalId: affiliateConversions.externalId })
    .from(affiliateConversions)
    .where(
      sql`(${affiliateConversions.partner}, ${affiliateConversions.externalId}) in (${sql.join(pairs, sql`, `)})`,
    );
  return new Set(found.map((item) => keyOf(item.partner, item.externalId)));
}

// Subid che corrispondono a un click registrato: una query sulla lista dei subid del file.
async function findLinkedSubids(db: ConversionDb, subids: readonly string[]): Promise<Set<string>> {
  if (subids.length === 0) return new Set();
  const found = await db
    .select({ subid: affiliateClicks.subid })
    .from(affiliateClicks)
    .where(inArray(affiliateClicks.subid, [...subids]));
  return new Set(found.map((item) => item.subid));
}

// Coppie partner|subid già salvate per i subid del file: una query, per l'avviso di possibile duplicato.
async function findConvertedPairs(db: ConversionDb, subids: readonly string[]): Promise<Set<string>> {
  if (subids.length === 0) return new Set();
  const found = await db
    .select({ partner: affiliateConversions.partner, subid: affiliateConversions.subid })
    .from(affiliateConversions)
    .where(inArray(affiliateConversions.subid, [...subids]));
  return new Set(found.map((item) => `${item.partner}|${item.subid}`));
}

// Decide per ogni riga: scartata, nuova o aggiornata. Un duplicato nel file (stessa coppia partner
// e external_id) resta solo la prima occorrenza: il secondo INSERT sullo stesso vincolo non è valido.
async function analyze(db: ConversionDb, fileName: string, entries: readonly Entry[]): Promise<Analysis> {
  const candidates = entries.map(candidateOf);

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.row === null) continue;
    const key = keyOf(candidate.row.partner, candidate.row.externalId);
    if (seen.has(key)) {
      candidate.errors.push({ code: "duplicate_external_id", column: "external_id", value: candidate.externalId });
      candidate.row = null;
    } else {
      seen.add(key);
    }
  }

  const validRows = candidates.flatMap((candidate) => (candidate.row === null ? [] : [candidate.row]));
  const existing = await findExistingKeys(db, validRows);
  const linked = await findLinkedSubids(db, [...new Set(validRows.map((row) => row.subid))]);

  // Possibile duplicato: riga nuova con id calcolato dal server e stesso subid già convertito dal partner.
  const suspectSubids = candidates.flatMap((candidate) =>
    candidate.row !== null &&
    candidate.externalIdComputed &&
    !existing.has(keyOf(candidate.row.partner, candidate.row.externalId))
      ? [candidate.row.subid]
      : [],
  );
  const convertedPairs = await findConvertedPairs(db, [...new Set(suspectSubids)]);

  const writes: Write[] = [];
  const rows: ConversionRowPreview[] = [];
  for (const candidate of candidates) {
    if (candidate.row === null) {
      rows.push({
        line: candidate.line,
        partner: candidate.partner,
        subid: candidate.subid,
        externalId: candidate.externalId,
        status: "error",
        withoutClick: false,
        possibleDuplicate: false,
        errors: candidate.errors,
      });
      continue;
    }
    const row = candidate.row;
    const status = existing.has(keyOf(row.partner, row.externalId)) ? "update" : "create";
    const possibleDuplicate =
      status === "create" && candidate.externalIdComputed && convertedPairs.has(`${row.partner}|${row.subid}`);
    rows.push({
      line: candidate.line,
      partner: row.partner,
      subid: row.subid,
      externalId: row.externalId,
      status,
      withoutClick: !linked.has(row.subid),
      possibleDuplicate,
      errors: [],
    });
    writes.push({ row, status });
  }

  const totals = { create: 0, update: 0, error: 0, withoutClick: 0, possibleDuplicate: 0 };
  for (const preview of rows) {
    totals[preview.status] += 1;
    if (preview.withoutClick) totals.withoutClick += 1;
    if (preview.possibleDuplicate) totals.possibleDuplicate += 1;
  }

  return {
    preview: {
      fileName,
      totals,
      rows: rows.slice(0, PREVIEW_ROW_LIMIT),
      truncated: rows.length > PREVIEW_ROW_LIMIT,
    },
    writes,
  };
}

// Legge il CSV e lo risolve. Restituisce l'anteprima e le scritture pianificate, senza scrivere.
async function analyzeCsv(db: ConversionDb, fileName: string, text: string): Promise<Analyzed> {
  if (text.trim() === "") return failure("file_empty");

  let parsed: CsvDocument;
  try {
    parsed = parseCsv(text);
  } catch (error) {
    if (error instanceof CsvParseError) return failure("csv_invalid");
    throw error;
  }

  const header = checkConversionHeader(parsed.header);
  if (!header.ok) return failure("header_invalid", [...header.missing, ...header.unknown]);
  if (parsed.rows.length === 0) return failure("file_empty");
  if (parsed.rows.length > MAX_CONVERSION_ROWS) return failure("too_many_rows");

  const entries = parsed.rows.map(({ line, cells }): Entry => {
    const position = header.index.external_id;
    return {
      result: normalizeConversionRow(line, cells, header.index),
      externalIdComputed: position === undefined || (cells[position] ?? "").trim() === "",
    };
  });
  return { ok: true, analysis: await analyze(db, fileName, entries) };
}

// Scrive le righe valide: insert o aggiornamento su (partner, external_id). Aggiorna stato, importi,
// data della conversione e updated_at; subid e source della prima importazione restano.
async function writeConversions(
  db: ConversionDb,
  rows: readonly ConversionRow[],
  source: ConversionSource,
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(affiliateConversions)
    .values(
      rows.map((row) => ({
        partner: row.partner,
        subid: row.subid,
        externalId: row.externalId,
        amountEur: row.amountEur,
        commissionEur: row.commissionEur,
        status: row.status,
        reportedAt: new Date(`${row.reportedAt}T00:00:00Z`),
        source,
      })),
    )
    .onConflictDoUpdate({
      target: [affiliateConversions.partner, affiliateConversions.externalId],
      set: {
        status: sql`excluded.status`,
        amountEur: sql`excluded.amount_eur`,
        commissionEur: sql`excluded.commission_eur`,
        reportedAt: sql`excluded.reported_at`,
        updatedAt: sql`now()`,
      },
    });
}

async function applyAnalysis(
  db: ConversionDb,
  analysis: Analysis,
  source: ConversionSource,
): Promise<ConversionImportResult> {
  await writeConversions(
    db,
    analysis.writes.map((write) => write.row),
    source,
  );
  return {
    created: analysis.writes.filter((write) => write.status === "create").length,
    updated: analysis.writes.filter((write) => write.status === "update").length,
    skipped: analysis.preview.totals.error,
    withoutClick: analysis.preview.totals.withoutClick,
  };
}

// Anteprima: nessuna scrittura. Il chiamante la esegue in una transazione.
export async function buildConversionImportPreview(
  db: ConversionDb,
  fileName: string,
  text: string,
): Promise<ConversionImportOutcome> {
  const analyzed = await analyzeCsv(db, fileName, text);
  if (!analyzed.ok) return analyzed.outcome;
  return { status: "preview", preview: analyzed.analysis.preview };
}

// Conferma: riesegue parsing e validazione (il file dell'anteprima non è fidato) e scrive nella
// stessa transazione, con una riga nel registro. Senza righe valide non scrive nulla.
export async function commitConversionImport(
  db: ConversionDb,
  actorId: string,
  fileName: string,
  text: string,
): Promise<ConversionImportOutcome> {
  const analyzed = await analyzeCsv(db, fileName, text);
  if (!analyzed.ok) return analyzed.outcome;
  const { analysis } = analyzed;
  if (analysis.writes.length === 0) return { status: "preview", preview: analysis.preview };

  const result = await applyAnalysis(db, analysis, "csv");
  await db.insert(adminAuditLog).values({
    actorId,
    action: "conversions.import",
    entity: "affiliate_conversions",
    entityId: null,
    diff: {
      file: fileName,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      without_click: result.withoutClick,
    },
  });
  return { status: "imported", result };
}

// Scrittura di righe già normalizzate (adattatori API del cron). Stesse regole del CSV: le righe
// duplicate nello stesso lotto si scartano, il resto è idempotente.
export async function applyConversionRows(
  db: ConversionDb,
  rows: readonly ConversionRow[],
  source: ConversionSource,
): Promise<ConversionApplyResult> {
  const entries = rows.map(
    (row, index): Entry => ({ result: { ok: true, line: index + 1, row }, externalIdComputed: false }),
  );
  const analysis = await analyze(db, source, entries);
  const result = await applyAnalysis(db, analysis, source);
  return { created: result.created, updated: result.updated, skipped: result.skipped };
}
