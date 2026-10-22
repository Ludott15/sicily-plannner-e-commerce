// Aeroporti di partenza verso la Sicilia, da tutto il mondo (ricerca voli, passo 2.1).
// Dati: src/data/departure-airports.json, generato da scripts/data/airports.mjs (OurAirports, npm run data:airports).
// Questo modulo importa il JSON: va usato solo lato server. La combobox nel browser passa dalla route
// GET /api/flights/airports, che chiama searchDepartures.

import departureAirportsJson from "@/data/departure-airports.json";
import { countryName, departureAirportsSchema, type DepartureAirport } from "./airport-api";
import { normalizeSearchText } from "./search-text";

export type { DepartureAirport };
export { normalizeSearchText };

export const DEPARTURE_AIRPORTS: readonly DepartureAirport[] = departureAirportsSchema.parse(departureAirportsJson);

const DEFAULT_LIMIT = 8;

type Indexed = {
  airport: DepartureAirport;
  iata: string;
  cities: string[];
  words: string[];
};

// Il nome del paese (in italiano e in inglese) è nell'indice: "Stati Uniti" e "United States" trovano gli aeroporti.
const INDEX: readonly Indexed[] = DEPARTURE_AIRPORTS.map((airport) => {
  const cities = [normalizeSearchText(airport.city_it), normalizeSearchText(airport.city_en)];
  const countries = (["it", "en"] as const).map((lang) => normalizeSearchText(countryName(airport.country, lang)));
  const words = [...cities, normalizeSearchText(airport.name), ...countries].join(" ").split(" ").filter(Boolean);
  return { airport, iata: airport.iata.toLowerCase(), cities, words };
});

const BY_IATA = new Map(DEPARTURE_AIRPORTS.map((airport) => [airport.iata, airport]));

export function getDeparture(iata: string): DepartureAirport | null {
  return BY_IATA.get(iata.toUpperCase()) ?? null;
}

// Punteggio più basso = più pertinente; null = nessuna corrispondenza.
// 0: codice IATA esatto. 1: codice o città che iniziano con la ricerca.
// 2: tutte le parole della ricerca iniziano una parola di città, aeroporto o paese.
function rank(entry: Indexed, query: string, tokens: readonly string[]): number | null {
  if (entry.iata === query) return 0;
  if (entry.iata.startsWith(query) || entry.cities.some((city) => city.startsWith(query))) return 1;
  return tokens.every((token) => entry.words.some((word) => word.startsWith(token))) ? 2 : null;
}

// Ricerca per città, nome, paese o codice, senza accenti e maiuscole. Vuota per una ricerca vuota.
export function searchDepartures(query: string, limit: number = DEFAULT_LIMIT): DepartureAirport[] {
  const normalized = normalizeSearchText(query);
  if (normalized === "") return [];
  const tokens = normalized.split(" ");
  const ranked: { airport: DepartureAirport; rank: number }[] = [];
  for (const entry of INDEX) {
    const score = rank(entry, normalized, tokens);
    if (score !== null) ranked.push({ airport: entry.airport, rank: score });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.airport.city_it.localeCompare(b.airport.city_it, "it") || a.airport.iata.localeCompare(b.airport.iata));
  return ranked.slice(0, Math.max(0, limit)).map((item) => item.airport);
}
