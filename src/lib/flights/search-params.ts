// Parametri di /voli (passo 2.1): parse e serializzazione puri, usati dalla pagina server, dal
// componente FlightSearch e dai test. Lo stato della ricerca sta nell'URL, quindi i risultati
// si condividono e si ricaricano così come sono.
//   da       IATA di partenza (3 lettere)
//   a        aeroporto siciliano di arrivo (CTA, PMO, TPS, CIY, LMP, PNL)
//   andata   data di andata YYYY-MM-DD
//   ritorno  data di ritorno YYYY-MM-DD, solo con andata e ritorno (dopo l'andata)
//   persone  passeggeri 1..9 (predefinito 1)
//   viaggio  uuid del viaggio da cui si arriva (chip "Voli" della checklist)

import { isSicilyAirport, type SicilyAirportCode } from "./airports";

export const MAX_PASSENGERS = 9;

export type FlightSearchParams = {
  origin: string | null;
  destination: SicilyAirportCode | null;
  departure: string | null;
  returnDate: string | null;
  passengers: number;
  itineraryId: string | null;
};

export type RawSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const IATA = /^[A-Z]{3}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Data reale del calendario (il 30 febbraio non esiste) nel formato YYYY-MM-DD.
export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Primo valore del parametro: con più valori per lo stesso nome vale il primo.
function first(raw: string | readonly string[] | undefined): string | null {
  if (typeof raw === "string") return raw.trim();
  const value = raw?.[0];
  return typeof value === "string" ? value.trim() : null;
}

function isoDateOrNull(value: string | null): string | null {
  return value !== null && isIsoDate(value) ? value : null;
}

export function parseFlightSearchParams(raw: RawSearchParams): FlightSearchParams {
  const origin = first(raw.da)?.toUpperCase() ?? null;
  const destinationCode = first(raw.a)?.toUpperCase() ?? null;
  const departure = isoDateOrNull(first(raw.andata));
  const candidateReturn = isoDateOrNull(first(raw.ritorno));
  const passengersRaw = Number(first(raw.persone));
  const itineraryRaw = first(raw.viaggio);

  return {
    origin: origin !== null && IATA.test(origin) ? origin : null,
    destination: destinationCode !== null && isSicilyAirport(destinationCode) ? destinationCode : null,
    departure,
    // Il ritorno ha senso solo dopo l'andata: altrimenti la ricerca è di sola andata.
    returnDate: departure !== null && candidateReturn !== null && candidateReturn >= departure ? candidateReturn : null,
    passengers: Number.isInteger(passengersRaw) && passengersRaw >= 1 && passengersRaw <= MAX_PASSENGERS ? passengersRaw : 1,
    itineraryId: itineraryRaw !== null && UUID.test(itineraryRaw) ? itineraryRaw.toLowerCase() : null,
  };
}

// Query string (senza "?") con solo i valori presenti, in ordine fisso.
export function serializeFlightSearchParams(params: Partial<FlightSearchParams>): string {
  const query = new URLSearchParams();
  if (params.origin) query.set("da", params.origin);
  if (params.destination) query.set("a", params.destination);
  if (params.departure) query.set("andata", params.departure);
  if (params.returnDate) query.set("ritorno", params.returnDate);
  if (params.passengers !== undefined) query.set("persone", String(params.passengers));
  if (params.itineraryId) query.set("viaggio", params.itineraryId);
  return query.toString();
}

// Percorso localizzato di /voli con la ricerca nell'URL: /it/voli?da=…&a=…
export function flightSearchPath(locale: string, params: Partial<FlightSearchParams>): string {
  const query = serializeFlightSearchParams(params);
  return query === "" ? `/${locale}/voli` : `/${locale}/voli?${query}`;
}
