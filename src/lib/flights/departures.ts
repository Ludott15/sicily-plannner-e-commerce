// Aeroporti di partenza verso la Sicilia (ricerca voli, passo 2.1).
// Fonte: codici IATA pubblici (IATA, OurAirports); elenco curato a mano, da verificare prima del lancio.
// Il file JSON è in src/data/departure-airports.json: iata, città (it/en), nome, paese (ISO-2).

import { z } from "zod";
import departureAirportsJson from "@/data/departure-airports.json";

const departureAirportSchema = z.object({
  iata: z.string().regex(/^[A-Z]{3}$/),
  city_it: z.string().min(1),
  city_en: z.string().min(1),
  name: z.string().min(1),
  country: z.string().regex(/^[A-Z]{2}$/),
});

export type DepartureAirport = z.infer<typeof departureAirportSchema>;

export const DEPARTURE_AIRPORTS: readonly DepartureAirport[] = z
  .array(departureAirportSchema)
  .parse(departureAirportsJson);

const DEFAULT_LIMIT = 8;

// Minuscole, senza accenti, con i separatori ridotti a spazio: "Düsseldorf" e "dusseldorf" coincidono.
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Indexed = {
  airport: DepartureAirport;
  iata: string;
  cities: string[];
  words: string[];
};

const INDEX: readonly Indexed[] = DEPARTURE_AIRPORTS.map((airport) => {
  const cities = [normalizeSearchText(airport.city_it), normalizeSearchText(airport.city_en)];
  const words = [...cities, normalizeSearchText(airport.name)].join(" ").split(" ").filter(Boolean);
  return { airport, iata: airport.iata.toLowerCase(), cities, words };
});

const BY_IATA = new Map(DEPARTURE_AIRPORTS.map((airport) => [airport.iata, airport]));

export function getDeparture(iata: string): DepartureAirport | null {
  return BY_IATA.get(iata.toUpperCase()) ?? null;
}

// Punteggio più basso = più pertinente; null = nessuna corrispondenza.
// 0: codice IATA esatto. 1: codice o città che iniziano con la ricerca.
// 2: tutte le parole della ricerca iniziano una parola di città o aeroporto.
function rank(entry: Indexed, query: string, tokens: readonly string[]): number | null {
  if (entry.iata === query) return 0;
  if (entry.iata.startsWith(query) || entry.cities.some((city) => city.startsWith(query))) return 1;
  return tokens.every((token) => entry.words.some((word) => word.startsWith(token))) ? 2 : null;
}

// Ricerca per città, nome o codice, senza accenti e maiuscole. Vuota per una ricerca vuota.
export function searchDepartures(query: string, limit: number = DEFAULT_LIMIT): DepartureAirport[] {
  const normalized = normalizeSearchText(query);
  if (normalized === "") return [];
  const tokens = normalized.split(" ");
  const ranked: { airport: DepartureAirport; rank: number }[] = [];
  for (const entry of INDEX) {
    const score = rank(entry, normalized, tokens);
    if (score !== null) ranked.push({ airport: entry.airport, rank: score });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.airport.city_it.localeCompare(b.airport.city_it, "it"));
  return ranked.slice(0, Math.max(0, limit)).map((item) => item.airport);
}
