import "server-only";
import { SICILY_AIRPORTS, type SicilyAirport, type SicilyAirportCode } from "@/lib/flights/airports";
import { calendarDays, nextMonth, pickBest, type CalendarDay, type OfferPrice } from "@/lib/flights/offers";
import { type PopularRoute } from "@/lib/flights/routes";
import { fetchPrices, type PricesResult } from "./client";

// Ricerca voli per più destinazioni. Le chiamate al fornitore partono in parallelo, al massimo
// MAX_CONCURRENT_REQUESTS alla volta; ogni chiamata è in cache di Next (vedi client.ts).
// Nessuna query al database qui: la ricerca non scrive nulla.

export const MAX_CONCURRENT_REQUESTS = 6;

// Applica fn a tutti gli elementi, a blocchi di `limit` chiamate in parallelo, mantenendo l'ordine.
export async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let start = 0; start < items.length; start += limit) {
    const chunk = items.slice(start, start + limit);
    out.push(...(await Promise.all(chunk.map(fn))));
  }
  return out;
}

export type DestinationResult = {
  airport: SicilyAirport;
  best: OfferPrice | null;
};

export type SearchOutcome =
  | { status: "ok"; results: DestinationResult[] }
  | { status: "unconfigured" }
  | { status: "unavailable" };

// Migliore offerta per ogni aeroporto scelto. unconfigured se manca il token (nessuna chiamata
// è partita), unavailable se tutte le chiamate sono fallite.
export async function searchFlights(input: {
  origin: string;
  destinations: readonly SicilyAirportCode[];
  departure: string;
  returnDate: string | null;
}): Promise<SearchOutcome> {
  const pairs = await mapLimited(input.destinations, MAX_CONCURRENT_REQUESTS, async (destination) => ({
    destination,
    outcome: await fetchPrices({
      origin: input.origin,
      destination,
      departure: input.departure,
      returnDate: input.returnDate,
    }),
  }));
  if (pairs.length === 0) return { status: "unavailable" };
  if (pairs.every((pair) => pair.outcome.status === "unconfigured")) return { status: "unconfigured" };
  if (pairs.every((pair) => pair.outcome.status !== "ok")) return { status: "unavailable" };
  return {
    status: "ok",
    results: pairs.map(({ destination, outcome }) => ({
      airport: SICILY_AIRPORTS[destination],
      best: outcome.status === "ok" ? pickBest(outcome.prices) : null,
    })),
  };
}

// Prezzo minimo per giorno del mese di andata; null se non ci sono dati (senza token o errore).
export async function monthCalendar(input: {
  origin: string;
  destination: SicilyAirportCode;
  month: string;
}): Promise<CalendarDay[] | null> {
  const outcome: PricesResult = await fetchPrices({
    origin: input.origin,
    destination: input.destination,
    departure: input.month,
    returnDate: null,
  });
  return outcome.status === "ok" ? calendarDays(outcome.prices) : null;
}

// Una coppia "ha prezzi" se il mese successivo ne restituisce almeno uno: decide se la pagina
// esiste (notFound) e se la coppia entra in sitemap.
export async function routeHasPrices(route: PopularRoute, now: Date = new Date()): Promise<boolean> {
  const outcome = await fetchPrices({
    origin: route.origin,
    destination: route.destination,
    departure: nextMonth(now),
    returnDate: null,
  });
  return outcome.status === "ok" && outcome.prices.length > 0;
}
