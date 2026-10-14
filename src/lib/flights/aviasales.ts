// Destinazione dei voli: la ricerca di Aviasales (passo 2.1). Pura: costruisce solo URL con host
// fisso. Nessun input esterno diventa host o percorso: origine, destinazione, date e passeggeri
// sono validati e poi composti nel formato di ricerca di Aviasales.

export const AVIASALES_HOST = "www.aviasales.com";

export type AviasalesSearch = {
  origin: string;
  destination: string;
  departure: string;
  returnDate: string | null;
  passengers: number;
  subId: string;
  marker: string | null;
  locale: string;
};

const IATA = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SUB_ID = /^[a-z0-9]{1,64}$/;
const MARKER = /^[A-Za-z0-9_-]{1,64}$/;
const LOCALE = /^[a-z]{2}$/;

// Marker dalla configurazione: se non è valido si ignora (il link resta senza marker).
export function safeMarker(raw: string | undefined): string | null {
  const value = raw?.trim() ?? "";
  return MARKER.test(value) ? value : null;
}

// DDMM, come nel percorso di ricerca di Aviasales (es. 15/10 → "1510").
function ddmm(isoDate: string): string {
  return `${isoDate.slice(8, 10)}${isoDate.slice(5, 7)}`;
}

// Errore di programmazione o di input non valido: non si costruisce un link.
export class InvalidAviasalesSearchError extends Error {
  constructor(field: string) {
    super(`invalid_aviasales_search: ${field}`);
    this.name = "InvalidAviasalesSearchError";
  }
}

export function buildAviasalesUrl(search: AviasalesSearch): URL {
  if (!IATA.test(search.origin)) throw new InvalidAviasalesSearchError("origin");
  if (!IATA.test(search.destination)) throw new InvalidAviasalesSearchError("destination");
  if (!ISO_DATE.test(search.departure)) throw new InvalidAviasalesSearchError("departure");
  if (search.returnDate !== null && !ISO_DATE.test(search.returnDate)) throw new InvalidAviasalesSearchError("returnDate");
  if (!Number.isInteger(search.passengers) || search.passengers < 1 || search.passengers > 9) {
    throw new InvalidAviasalesSearchError("passengers");
  }
  if (!SUB_ID.test(search.subId)) throw new InvalidAviasalesSearchError("subId");
  if (search.marker !== null && !MARKER.test(search.marker)) throw new InvalidAviasalesSearchError("marker");
  if (!LOCALE.test(search.locale)) throw new InvalidAviasalesSearchError("locale");

  const path = [
    search.origin,
    ddmm(search.departure),
    search.destination,
    search.returnDate === null ? "" : ddmm(search.returnDate),
    String(search.passengers),
  ].join("");

  const url = new URL(`https://${AVIASALES_HOST}/search/${path}`);
  if (search.marker !== null) url.searchParams.set("marker", search.marker);
  url.searchParams.set("sub_id", search.subId);
  url.searchParams.set("currency", "eur");
  url.searchParams.set("locale", search.locale);
  return url;
}
