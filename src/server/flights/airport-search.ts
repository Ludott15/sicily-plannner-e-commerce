import "server-only";
import { AIRPORT_RESULTS_MAX, airportQuerySchema, type DepartureAirport } from "@/lib/flights/airport-api";
import { searchDepartures } from "@/lib/flights/departures";

// Ricerca degli aeroporti di partenza per la combobox (route GET /api/flights/airports).
// Zod → ricerca in memoria: nessun dato personale, nessuna scrittura.

export type AirportSearchResult = { ok: true; airports: DepartureAirport[] } | { ok: false; error: "invalid" };

export function searchAirportsForCombobox(input: unknown): AirportSearchResult {
  const parsed = airportQuerySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return { ok: true, airports: searchDepartures(parsed.data.q, AIRPORT_RESULTS_MAX) };
}
