// Esportazione CSV delle conversioni (passo 3.3). Pura: riceve le righe già lette dal database.
// Separatore ";" e importi con la virgola, come si aspetta Excel in italiano; file con BOM UTF-8.
// Il parser di importazione accetta sia "," sia ";" e sia il punto sia la virgola nei decimali.

export const EXPORT_HEADER = [
  "data",
  "partner",
  "subid",
  "contesto",
  "attività",
  "importo_eur",
  "commissione_eur",
  "stato",
] as const;

export type ConversionExportRow = {
  reportedAt: string;
  partner: string;
  subid: string;
  context: string | null;
  activityTitle: string | null;
  amountEur: string | null;
  commissionEur: string | null;
  status: string;
};

const FORMULA_START = /^[=+\-@\t\r]/;

// Campo CSV: tra virgolette se contiene ";", virgolette o a capo (le virgolette si raddoppiano).
// Un valore che inizia con = + - @ o tab viene preceduto da un apostrofo, così un foglio di calcolo
// non lo esegue come formula (i testi arrivano dai report dei partner).
export function csvField(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  if (!/[";\r\n]/.test(safe)) return safe;
  return `"${safe.replace(/"/g, '""')}"`;
}

function decimalComma(value: string | null): string {
  return value === null ? "" : value.replace(".", ",");
}

export function conversionsCsv(rows: readonly ConversionExportRow[]): string {
  const lines = [
    EXPORT_HEADER.join(";"),
    ...rows.map((row) =>
      [
        row.reportedAt,
        row.partner,
        row.subid,
        row.context ?? "",
        row.activityTitle ?? "",
        decimalComma(row.amountEur),
        decimalComma(row.commissionEur),
        row.status,
      ]
        .map(csvField)
        .join(";"),
    ),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}
