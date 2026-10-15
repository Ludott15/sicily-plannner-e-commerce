// Costanti e normalizzazione condivise dagli adattatori dei partner (codice puro).

export const PAGE_SIZE = 100;
export const MAX_PAGES = 10;
export const REQUEST_TIMEOUT_MS = 15_000;
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

// Testo pulito e accorciato; null se vuoto.
export function cleanText(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined) return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text === "" ? null : text.slice(0, max);
}

// Valuta ISO a tre lettere maiuscole; in caso contrario EUR (il catalogo è in euro).
export function currencyOf(value: string | null | undefined): string {
  const code = (value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "EUR";
}

export function priceOf(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 1_000_000) return null;
  return Math.round(value * 100) / 100;
}

export function ratingOf(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 5) return null;
  return Math.round(value * 10) / 10;
}

export function countOf(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return value;
}

export function coordsOf(
  lat: number | null | undefined,
  lng: number | null | undefined,
): { lat: number; lng: number } | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
