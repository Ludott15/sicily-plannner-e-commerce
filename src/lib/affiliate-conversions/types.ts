// Tipi e costanti delle conversioni affiliate (passo 3.3). Nessun accesso al database: si può
// importare anche dal client (le funzioni che usano node:crypto stanno in altri file).

// Partner che possono avere conversioni: l'enum partner senza "internal".
// Deve coincidere con l'enum del database: lo verifica conversions.int.test.ts.
export const CONVERSION_PARTNERS = [
  "travelpayouts",
  "getyourguide",
  "viator",
  "car_rental",
  "booking",
  "discovercars",
  "civitatis",
] as const;
export type ConversionPartner = (typeof CONVERSION_PARTNERS)[number];

export const CONVERSION_STATUSES = ["pending", "approved", "cancelled", "paid"] as const;
export type ConversionStatus = (typeof CONVERSION_STATUSES)[number];

export const CONVERSION_SOURCES = ["csv", "api"] as const;
export type ConversionSource = (typeof CONVERSION_SOURCES)[number];

// Una conversione normalizzata, pronta per la scrittura (dal CSV o dall'API di un partner).
// amountEur e commissionEur sono stringhe decimali con due cifre ("120.00").
// reportedAt è YYYY-MM-DD. externalId è sempre valorizzato (dal report o calcolato).
export type ConversionRow = {
  partner: ConversionPartner;
  subid: string;
  externalId: string;
  amountEur: string;
  commissionEur: string;
  status: ConversionStatus;
  reportedAt: string;
};

// Colonne del CSV delle conversioni (intestazione in questo ordine nel modello).
export const CONVERSION_COLUMNS = [
  "partner",
  "subid",
  "external_id",
  "amount_eur",
  "commission_eur",
  "status",
  "reported_at",
] as const;
export type ConversionColumn = (typeof CONVERSION_COLUMNS)[number];

export const REQUIRED_CONVERSION_COLUMNS: readonly ConversionColumn[] = [
  "partner",
  "subid",
  "amount_eur",
  "commission_eur",
  "status",
  "reported_at",
];

export const MAX_CONVERSION_BYTES = 1_000_000;
export const MAX_CONVERSION_ROWS = 5000;
// Righe mostrate nell'anteprima; i totali riguardano tutto il file.
export const PREVIEW_ROW_LIMIT = 200;

export const CONVERSION_ISSUE_CODES = [
  "partner_invalid",
  "subid_invalid",
  "external_id_invalid",
  "amount_invalid",
  "commission_invalid",
  "status_invalid",
  "reported_at_invalid",
  "duplicate_external_id",
] as const;
export type ConversionIssueCode = (typeof CONVERSION_ISSUE_CODES)[number];

export type ConversionIssue = {
  code: ConversionIssueCode;
  column?: ConversionColumn;
  value?: string;
};

export const CONVERSION_FILE_ERRORS = [
  "file_missing",
  "file_too_large",
  "file_not_csv",
  "file_empty",
  "csv_invalid",
  "header_invalid",
  "too_many_rows",
  "failed",
] as const;
export type ConversionFileError = (typeof CONVERSION_FILE_ERRORS)[number];

export type ConversionRowStatus = "create" | "update" | "error";

export type ConversionRowPreview = {
  line: number;
  partner: string;
  subid: string;
  externalId: string;
  status: ConversionRowStatus;
  // Vero se il subid non corrisponde a nessun click (solo per le righe valide).
  withoutClick: boolean;
  // Vero se la riga è nuova con id del report calcolato dal server e il subid ha già una conversione
  // dello stesso partner con un altro id (solo per le righe valide).
  possibleDuplicate: boolean;
  errors: ConversionIssue[];
};

export type ConversionImportPreview = {
  fileName: string;
  totals: { create: number; update: number; error: number; withoutClick: number; possibleDuplicate: number };
  rows: ConversionRowPreview[];
  // Vero se rows è tagliato a PREVIEW_ROW_LIMIT.
  truncated: boolean;
};

export type ConversionImportResult = {
  created: number;
  updated: number;
  skipped: number;
  withoutClick: number;
};

export type ConversionImportOutcome =
  | { status: "preview"; preview: ConversionImportPreview }
  | { status: "imported"; result: ConversionImportResult }
  | { status: "error"; code: ConversionFileError; columns?: string[] };
