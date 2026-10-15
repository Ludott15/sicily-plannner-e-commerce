import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isIsoDate } from "@/lib/flights/search-params";

// Link firmati verso /api/go/flight (passo 2.1). Il server firma i parametri del viaggio con
// HMAC-SHA256 (chiave FLIGHT_LINK_SECRET) sulla stringa canonica
//   o|d|dep|ret|pax|c|i|exp
// e la route ricalcola la firma prima di costruire l'URL del fornitore: un link alterato o
// scaduto non esce. Il parametro l (lingua) non è firmato: cambia solo la lingua di Aviasales.
// Mai firma con chiave vuota.

export const FLIGHT_CONTEXTS = ["page", "itinerary", "chat", "flights"] as const;
export type FlightContext = (typeof FLIGHT_CONTEXTS)[number];

export const FLIGHT_LINK_TTL_SECONDS = 60 * 60 * 24;

export type FlightLink = {
  origin: string;
  destination: string;
  departure: string;
  returnDate: string | null;
  passengers: number;
  context: FlightContext;
  itineraryId: string | null;
  // Scadenza in secondi Unix.
  expiresAt: number;
};

export type FlightLinkCheck = "ok" | "missing_secret" | "invalid_signature" | "expired";

const IATA = /^[A-Z]{3}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Stringa canonica della firma. Ogni campo è validato, così il separatore "|" non può comparire
// in un valore e due link diversi non producono la stessa stringa.
export function canonicalFlightLink(link: FlightLink): string {
  if (!IATA.test(link.origin)) throw new Error("flight_link: origin");
  if (!IATA.test(link.destination)) throw new Error("flight_link: destination");
  if (!isIsoDate(link.departure)) throw new Error("flight_link: departure");
  if (link.returnDate !== null && !isIsoDate(link.returnDate)) throw new Error("flight_link: returnDate");
  if (!Number.isInteger(link.passengers) || link.passengers < 1 || link.passengers > 9) {
    throw new Error("flight_link: passengers");
  }
  if (!(FLIGHT_CONTEXTS as readonly string[]).includes(link.context)) throw new Error("flight_link: context");
  if (link.itineraryId !== null && !UUID.test(link.itineraryId)) throw new Error("flight_link: itineraryId");
  if (!Number.isInteger(link.expiresAt) || link.expiresAt <= 0) throw new Error("flight_link: expiresAt");
  return [
    link.origin,
    link.destination,
    link.departure,
    link.returnDate ?? "",
    String(link.passengers),
    link.context,
    link.itineraryId ?? "",
    String(link.expiresAt),
  ].join("|");
}

export function signFlightLink(link: FlightLink, secret: string | undefined): string {
  if (!secret) throw new Error("FLIGHT_LINK_SECRET mancante: impossibile firmare");
  return createHmac("sha256", secret).update(canonicalFlightLink(link)).digest("base64url");
}

// Controlla firma e scadenza. La firma si verifica per prima; il confronto è a tempo costante.
export function verifyFlightLink(
  link: FlightLink,
  signature: string,
  secret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): FlightLinkCheck {
  if (!secret) return "missing_secret";
  let expected: Buffer;
  try {
    expected = createHmac("sha256", secret).update(canonicalFlightLink(link)).digest();
  } catch {
    return "invalid_signature";
  }
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return "invalid_signature";
  if (link.expiresAt <= nowSeconds) return "expired";
  return "ok";
}

const linkQuerySchema = z.object({
  o: z.string().regex(IATA),
  d: z.string().regex(IATA),
  dep: z.string().refine(isIsoDate),
  ret: z.string().refine(isIsoDate).optional(),
  pax: z.string().regex(/^[1-9]$/).transform(Number),
  c: z.enum(FLIGHT_CONTEXTS),
  i: z.string().regex(UUID).optional(),
  exp: z.string().regex(/^[1-9]\d{0,11}$/).transform(Number),
  s: z.string().min(1).max(128),
});

// Legge i parametri della route. null se mancano o non sono validi (la firma si controlla dopo).
export function parseFlightLinkQuery(search: URLSearchParams): { link: FlightLink; signature: string } | null {
  const parsed = linkQuerySchema.safeParse({
    o: search.get("o"),
    d: search.get("d"),
    dep: search.get("dep"),
    ret: search.get("ret") ?? undefined,
    pax: search.get("pax"),
    c: search.get("c"),
    i: search.get("i") ?? undefined,
    exp: search.get("exp"),
    s: search.get("s"),
  });
  if (!parsed.success) return null;
  const q = parsed.data;
  return {
    link: {
      origin: q.o,
      destination: q.d,
      departure: q.dep,
      returnDate: q.ret ?? null,
      passengers: q.pax,
      context: q.c,
      itineraryId: q.i ?? null,
      expiresAt: q.exp,
    },
    signature: q.s,
  };
}

// URL relativo della route firmata, con la lingua della pagina di ripiego.
export function flightLinkHref(link: FlightLink, secret: string | undefined, locale: string): string {
  const query = new URLSearchParams({
    o: link.origin,
    d: link.destination,
    dep: link.departure,
  });
  if (link.returnDate !== null) query.set("ret", link.returnDate);
  query.set("pax", String(link.passengers));
  query.set("c", link.context);
  if (link.itineraryId !== null) query.set("i", link.itineraryId);
  query.set("exp", String(link.expiresAt));
  query.set("s", signFlightLink(link, secret));
  query.set("l", locale);
  return `/api/go/flight?${query.toString()}`;
}
