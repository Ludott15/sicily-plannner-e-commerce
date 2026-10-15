import "server-only";
import { z } from "zod";
import { type OfferPrice } from "@/lib/flights/offers";
import { checkUrl } from "@/server/media/safe-fetch";

// Chiamate a Travelpayouts Data API v3 (prices_for_dates) con cache della data di Next:
// fetch con next.revalidate di 6 ore e tag "flights". Nessuna riga nel database.
// L'host è fisso (allowlist esatta), il token va nell'header X-Access-Token e non compare mai
// nell'URL. Senza TRAVELPAYOUTS_TOKEN la funzione non chiama nulla.

export const FLIGHT_API_HOST = "api.travelpayouts.com";
export const FLIGHT_API_PATH = "/aviasales/v3/prices_for_dates";
export const FLIGHT_CACHE_SECONDS = 60 * 60 * 6;
export const FLIGHT_CACHE_TAG = "flights";

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 512 * 1024;

const priceSchema = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  departure_at: z.string().min(1),
  return_at: z.string().nullish(),
  price: z.number().nonnegative(),
  airline: z.string().nullish(),
  transfers: z.number().int().nonnegative().nullish(),
  found_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});

const envelopeSchema = z.object({
  success: z.boolean().optional(),
  data: z.unknown().optional(),
});

export type PriceQuery = {
  origin: string;
  destination: string;
  // YYYY-MM-DD per una data precisa, YYYY-MM per il mese (calendario).
  departure: string;
  returnDate: string | null;
};

export type PricesResult =
  | { status: "ok"; prices: OfferPrice[] }
  | { status: "unconfigured" }
  | { status: "unavailable" };

const DEPARTURE = /^\d{4}-\d{2}(-\d{2})?$/;
const IATA = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function buildUrl(query: PriceQuery): URL {
  const url = new URL(`https://${FLIGHT_API_HOST}${FLIGHT_API_PATH}`);
  url.searchParams.set("origin", query.origin);
  url.searchParams.set("destination", query.destination);
  url.searchParams.set("departure_at", query.departure);
  if (query.returnDate !== null) url.searchParams.set("return_at", query.returnDate);
  url.searchParams.set("one_way", query.returnDate === null ? "true" : "false");
  url.searchParams.set("currency", "eur");
  url.searchParams.set("sorting", "price");
  url.searchParams.set("direct", "false");
  url.searchParams.set("limit", "30");
  return checkUrl(url, [FLIGHT_API_HOST]);
}

// Campi sconosciuti scartati; una riga non valida scarta solo sé stessa.
export function parsePrices(body: unknown, fetchedAt: string): OfferPrice[] {
  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success || envelope.data.success === false || !Array.isArray(envelope.data.data)) return [];
  const prices: OfferPrice[] = [];
  for (const item of envelope.data.data) {
    const row = priceSchema.safeParse(item);
    if (!row.success) continue;
    const r = row.data;
    prices.push({
      origin: r.origin,
      destination: r.destination,
      departureAt: r.departure_at,
      returnAt: r.return_at ?? null,
      price: r.price,
      airline: r.airline ?? null,
      transfers: r.transfers ?? 0,
      updatedAt: r.found_at ?? r.updated_at ?? fetchedAt,
    });
  }
  return prices;
}

// Legge il corpo fermandosi appena supera maxBytes: null se è troppo grande o manca.
async function readCapped(response: Response, maxBytes: number): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function fetchPrices(query: PriceQuery): Promise<PricesResult> {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) return { status: "unconfigured" };
  if (!IATA.test(query.origin) || !IATA.test(query.destination)) return { status: "unavailable" };
  if (!DEPARTURE.test(query.departure)) return { status: "unavailable" };
  if (query.returnDate !== null && !ISO_DATE.test(query.returnDate)) return { status: "unavailable" };

  let response: Response;
  try {
    response = await fetch(buildUrl(query), {
      method: "GET",
      headers: { "X-Access-Token": token, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: FLIGHT_CACHE_SECONDS, tags: [FLIGHT_CACHE_TAG] },
    });
  } catch {
    return { status: "unavailable" };
  }
  if (!response.ok) return { status: "unavailable" };
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) return { status: "unavailable" };
  const declared = Number(response.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > MAX_BYTES) return { status: "unavailable" };

  // Lettura a pezzi con limite: senza Content-Length (risposta chunked) un corpo enorme non
  // viene mai tenuto tutto in memoria.
  let text: string | null;
  try {
    text = await readCapped(response, MAX_BYTES);
  } catch {
    return { status: "unavailable" };
  }
  if (text === null) return { status: "unavailable" };

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { status: "unavailable" };
  }
  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success || envelope.data.success === false) return { status: "unavailable" };
  return { status: "ok", prices: parsePrices(body, new Date().toISOString()) };
}
