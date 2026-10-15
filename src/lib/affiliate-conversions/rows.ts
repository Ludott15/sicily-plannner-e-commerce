import { externalIdFor } from "./external-id";
import {
  CONVERSION_COLUMNS,
  CONVERSION_PARTNERS,
  REQUIRED_CONVERSION_COLUMNS,
  type ConversionColumn,
  type ConversionIssue,
  type ConversionIssueCode,
  type ConversionPartner,
  type ConversionRow,
  type ConversionStatus,
} from "./types";

// Validazione pura delle righe del CSV delle conversioni (nessun accesso al database).
// Ogni riga restituisce tutti gli errori trovati, non solo il primo.

export type ConversionColumnIndex = Record<ConversionColumn, number | undefined>;

export type CheckConversionHeaderResult =
  | { ok: true; index: ConversionColumnIndex }
  | { ok: false; missing: string[]; unknown: string[] };

export type NormalizedConversion =
  | { ok: true; line: number; row: ConversionRow }
  | {
      ok: false;
      line: number;
      partner: string;
      subid: string;
      externalId: string;
      errors: ConversionIssue[];
    };

const SUBID_PATTERN = /^[a-z0-9]{12,32}$/;
const AMOUNT_PATTERN = /^\d{1,8}(?:[.,]\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EXTERNAL_ID_LENGTH = 120;
const MAX_VALUE_LENGTH = 120;

// Stati accettati nel file, in inglese (come nel database) e in italiano. Chiavi in minuscolo.
const STATUS_ALIASES: Readonly<Record<string, ConversionStatus>> = {
  pending: "pending",
  "in attesa": "pending",
  approved: "approved",
  approvata: "approved",
  approvato: "approved",
  cancelled: "cancelled",
  canceled: "cancelled",
  annullata: "cancelled",
  annullato: "cancelled",
  paid: "paid",
  pagata: "paid",
  pagato: "paid",
};

export function normalizeStatus(raw: string): ConversionStatus | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!Object.prototype.hasOwnProperty.call(STATUS_ALIASES, key)) return null;
  return STATUS_ALIASES[key] ?? null;
}

export function asConversionPartner(raw: string): ConversionPartner | null {
  const value = raw.trim().toLowerCase();
  return (CONVERSION_PARTNERS as readonly string[]).includes(value) ? (value as ConversionPartner) : null;
}

// Importo in euro: punto o virgola, al massimo due decimali, mai negativo. Restituisce "120.50".
export function parseAmount(raw: string): string | null {
  const value = raw.trim();
  if (!AMOUNT_PATTERN.test(value)) return null;
  return Number(value.replace(",", ".")).toFixed(2);
}

// Data YYYY-MM-DD di un calendario valido (es. 2026-02-30 non lo è).
export function parseReportedAt(raw: string): string | null {
  const value = raw.trim();
  if (!DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return value;
}

function isConversionColumn(name: string): name is ConversionColumn {
  return (CONVERSION_COLUMNS as readonly string[]).includes(name);
}

export function checkConversionHeader(header: string[]): CheckConversionHeaderResult {
  const index = Object.fromEntries(CONVERSION_COLUMNS.map((column) => [column, undefined])) as ConversionColumnIndex;
  const unknown: string[] = [];

  header.forEach((raw, position) => {
    const name = raw.trim().toLowerCase().replace(/\s+/g, "_");
    if (name === "") return;
    if (!isConversionColumn(name) || index[name] !== undefined) {
      unknown.push(raw.trim());
      return;
    }
    index[name] = position;
  });

  const missing = REQUIRED_CONVERSION_COLUMNS.filter((column) => index[column] === undefined);
  if (missing.length > 0 || unknown.length > 0) return { ok: false, missing: [...missing], unknown };
  return { ok: true, index };
}

function issue(code: ConversionIssueCode, column: ConversionColumn, value?: string): ConversionIssue {
  const shown = value === undefined ? "" : value.slice(0, MAX_VALUE_LENGTH);
  return shown === "" ? { code, column } : { code, column, value: shown };
}

export function normalizeConversionRow(
  line: number,
  cells: string[],
  index: ConversionColumnIndex,
): NormalizedConversion {
  const cell = (column: ConversionColumn): string => {
    const position = index[column];
    return position === undefined ? "" : (cells[position] ?? "").trim();
  };
  const errors: ConversionIssue[] = [];

  const partnerRaw = cell("partner").toLowerCase();
  const subidRaw = cell("subid").toLowerCase();
  const externalRaw = cell("external_id");
  const amountRaw = cell("amount_eur");
  const commissionRaw = cell("commission_eur");
  const statusRaw = cell("status");
  const reportedRaw = cell("reported_at");

  const partner = asConversionPartner(partnerRaw);
  if (partner === null) errors.push(issue("partner_invalid", "partner", partnerRaw));
  if (!SUBID_PATTERN.test(subidRaw)) errors.push(issue("subid_invalid", "subid", subidRaw));
  if (externalRaw.length > MAX_EXTERNAL_ID_LENGTH) {
    errors.push(issue("external_id_invalid", "external_id", externalRaw));
  }
  const amount = parseAmount(amountRaw);
  if (amount === null) errors.push(issue("amount_invalid", "amount_eur", amountRaw));
  const commission = parseAmount(commissionRaw);
  if (commission === null) errors.push(issue("commission_invalid", "commission_eur", commissionRaw));
  const status = normalizeStatus(statusRaw);
  if (status === null) errors.push(issue("status_invalid", "status", statusRaw));
  const reportedAt = parseReportedAt(reportedRaw);
  if (reportedAt === null) errors.push(issue("reported_at_invalid", "reported_at", reportedRaw));

  if (
    errors.length > 0 ||
    partner === null ||
    amount === null ||
    commission === null ||
    status === null ||
    reportedAt === null
  ) {
    return { ok: false, line, partner: partnerRaw, subid: subidRaw, externalId: externalRaw, errors };
  }

  const externalId =
    externalRaw === ""
      ? externalIdFor({ partner, subid: subidRaw, reportedAt, amountEur: amount })
      : externalRaw;

  return {
    ok: true,
    line,
    row: {
      partner,
      subid: subidRaw,
      externalId,
      amountEur: amount,
      commissionEur: commission,
      status,
      reportedAt,
    },
  };
}
