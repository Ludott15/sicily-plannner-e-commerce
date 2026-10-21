import { isIsoDate } from "@/lib/flights/search-params";

// Lettura dei parametri di ricerca delle pagine delle verticali. Funzioni pure: nessun valore
// dell'URL arriva al link senza passare da una lista chiusa o da una data ISO valida.

export type ParamValue = string | string[] | undefined;

// Primo valore del parametro, senza spazi ai bordi; stringa vuota se manca.
export function paramOf(value: ParamValue): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.trim() : "";
}

// Data ISO YYYY-MM-DD valida, altrimenti stringa vuota.
export function isoParam(value: ParamValue): string {
  const raw = paramOf(value);
  return raw !== "" && isIsoDate(raw) ? raw : "";
}

// Valore dentro una lista chiusa, altrimenti stringa vuota.
export function oneOfParam<T extends string>(value: ParamValue, options: readonly T[]): T | "" {
  const raw = paramOf(value);
  return (options as readonly string[]).includes(raw) ? (raw as T) : "";
}

// Numero intero tra 1 e max (per esempio le persone), altrimenti il valore di ripiego.
export function countParam(value: ParamValue, fallback: number, max: number): number {
  const n = Number(paramOf(value));
  return Number.isInteger(n) && n >= 1 && n <= max ? n : fallback;
}

// Soggiorno o noleggio: entrambe le date e la fine dopo l'inizio.
export function rangeOk(start: string, end: string): boolean {
  return start !== "" && end !== "" && end > start;
}

// Query string relativa ("?a=1&b=2") dai valori non vuoti: per i link alle alternative e ai tipi.
export function queryString(params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, value]) => value !== "");
  return entries.length === 0 ? "" : `?${new URLSearchParams(entries).toString()}`;
}

// Data ISO in forma lunga nella lingua della pagina ("24 ott 2026"). Fuso UTC: il giorno non cambia.
export function formatIsoDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}
