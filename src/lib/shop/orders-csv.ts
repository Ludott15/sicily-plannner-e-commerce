import type { VatBucket } from "./orders";

// CSV degli ordini per il commercialista (passo 7.3). Funzione pura: le righe arrivano già calcolate dal
// server. Stessa convenzione del CSV dei punti (src/server/privacy/export.ts): virgola, celle tra virgolette
// con le virgolette raddoppiate, a capo CRLF. Importi in euro con il punto decimale.

export const ORDERS_CSV_COLUMNS = [
  "data",
  "numero",
  "stato",
  "imponibile_4",
  "iva_4",
  "imponibile_10",
  "iva_10",
  "imponibile_22",
  "iva_22",
  "spedizione",
  "sconto_punti",
  "totale",
  "costo_acquisto",
] as const;

export type OrdersCsvRow = {
  // Data di creazione dell'ordine, già nel fuso di Roma (YYYY-MM-DD).
  date: string;
  orderNumber: string;
  status: string;
  // Righe per aliquota: lordo dei prodotti scomposto in imponibile e IVA (prima dello sconto punti).
  vat: Record<"4" | "10" | "22", VatBucket>;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  // Somma dei costi d'acquisto delle righe. Null se manca il costo di almeno una riga.
  costCents: number | null;
};

// Centesimi come importo in euro con due decimali: 1250 → "12.50", 5 → "0.05".
export function centsToDecimal(cents: number): string {
  if (!Number.isInteger(cents)) throw new RangeError("centsToDecimal: importo non intero");
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const euros = Math.floor(absolute / 100);
  const rest = String(absolute % 100).padStart(2, "0");
  return `${sign}${euros}.${rest}`;
}

// Cella: il valore è racchiuso tra virgolette e le virgolette interne si raddoppiano. Un valore vuoto
// (costo non disponibile) resta cella vuota, senza virgolette.
function cell(value: string | number | null): string {
  if (value === null) return "";
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function ordersCsv(rows: readonly OrdersCsvRow[]): string {
  const lines: string[] = [ORDERS_CSV_COLUMNS.map((name) => cell(name)).join(",")];
  for (const row of rows) {
    lines.push(
      [
        cell(row.date),
        cell(row.orderNumber),
        cell(row.status),
        cell(centsToDecimal(row.vat["4"].netCents)),
        cell(centsToDecimal(row.vat["4"].vatCents)),
        cell(centsToDecimal(row.vat["10"].netCents)),
        cell(centsToDecimal(row.vat["10"].vatCents)),
        cell(centsToDecimal(row.vat["22"].netCents)),
        cell(centsToDecimal(row.vat["22"].vatCents)),
        cell(centsToDecimal(row.shippingCents)),
        cell(centsToDecimal(row.discountCents)),
        cell(centsToDecimal(row.totalCents)),
        cell(row.costCents === null ? null : centsToDecimal(row.costCents)),
      ].join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
