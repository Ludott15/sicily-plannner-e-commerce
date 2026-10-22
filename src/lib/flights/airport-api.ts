// Contratto degli aeroporti di partenza: schema, limiti e nomi dei paesi. Nessun dato qui dentro,
// così il modulo sta nel bundle del browser (la combobox lo usa per validare la risposta della route
// GET /api/flights/airports). L'elenco completo è in departures.ts, lato server.

import { z } from "zod";

// La combobox manda al massimo questo testo; più lungo è una richiesta non valida.
export const AIRPORT_QUERY_MAX_LENGTH = 60;
// Risultati per richiesta: la combobox ne mostra una lista corta, con scorrimento.
export const AIRPORT_RESULTS_MAX = 12;

export const departureAirportSchema = z.object({
  iata: z.string().regex(/^[A-Z]{3}$/),
  city_it: z.string().min(1),
  city_en: z.string().min(1),
  name: z.string().min(1),
  country: z.string().regex(/^[A-Z]{2}$/),
});

export type DepartureAirport = z.infer<typeof departureAirportSchema>;

export const departureAirportsSchema = z.array(departureAirportSchema);

export const airportQuerySchema = z.object({
  q: z.string().max(AIRPORT_QUERY_MAX_LENGTH),
});

export const airportsResponseSchema = z.object({
  airports: departureAirportsSchema.max(AIRPORT_RESULTS_MAX),
});

export type AirportsResponse = z.infer<typeof airportsResponseSchema>;

const countryNameFormats = new Map<"it" | "en", Intl.DisplayNames>();

// Nome del paese nella lingua della pagina ("Stati Uniti", "United States"). Se il codice non è noto, il codice.
export function countryName(code: string, lang: "it" | "en"): string {
  let format = countryNameFormats.get(lang);
  if (!format) {
    format = new Intl.DisplayNames([lang], { type: "region" });
    countryNameFormats.set(lang, format);
  }
  return format.of(code) ?? code;
}
