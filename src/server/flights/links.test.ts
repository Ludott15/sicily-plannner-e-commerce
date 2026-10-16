import { describe, expect, it } from "vitest";
import {
  canonicalFlightLink,
  flightLinkHref,
  parseFlightLinkQuery,
  signFlightLink,
  verifyFlightLink,
  type FlightLink,
} from "./links";

const SECRET = "test-secret-do-not-use-in-prod";
const NOW = 1_800_000_000;
const ITINERARY = "0f1e2d3c-4b5a-4968-8777-665544332211";

const LINK: FlightLink = {
  origin: "FCO",
  destination: "CTA",
  departure: "2026-11-03",
  returnDate: "2026-11-10",
  passengers: 2,
  context: "flights",
  itineraryId: ITINERARY,
  expiresAt: NOW + 3600,
};

describe("canonicalFlightLink", () => {
  it("stringa fissa o|d|dep|ret|pax|c|i|exp", () => {
    expect(canonicalFlightLink(LINK)).toBe(`FCO|CTA|2026-11-03|2026-11-10|2|flights|${ITINERARY}|${NOW + 3600}`);
  });

  it("campi assenti restano vuoti, senza ambiguità con il separatore", () => {
    const oneWay: FlightLink = { ...LINK, returnDate: null, itineraryId: null };
    expect(canonicalFlightLink(oneWay)).toBe(`FCO|CTA|2026-11-03||2|flights||${NOW + 3600}`);
  });

  it("rifiuta valori che non sono nel formato atteso (niente | nei campi)", () => {
    expect(() => canonicalFlightLink({ ...LINK, origin: "FC|" })).toThrow();
    expect(() => canonicalFlightLink({ ...LINK, destination: "lmp" })).toThrow();
    expect(() => canonicalFlightLink({ ...LINK, departure: "2026-02-30" })).toThrow();
    expect(() => canonicalFlightLink({ ...LINK, passengers: 0 })).toThrow();
    expect(() => canonicalFlightLink({ ...LINK, itineraryId: "x" })).toThrow();
  });
});

describe("signFlightLink / verifyFlightLink", () => {
  it("firma valida e non scaduta: ok", () => {
    const signature = signFlightLink(LINK, SECRET);
    expect(verifyFlightLink(LINK, signature, SECRET, NOW)).toBe("ok");
  });

  it("firma deterministica per gli stessi dati e chiave", () => {
    expect(signFlightLink(LINK, SECRET)).toBe(signFlightLink(LINK, SECRET));
    expect(signFlightLink(LINK, SECRET)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("firma alterata: destinazione, passeggeri, contesto o itinerario cambiati", () => {
    const signature = signFlightLink(LINK, SECRET);
    expect(verifyFlightLink({ ...LINK, destination: "PMO" }, signature, SECRET, NOW)).toBe("invalid_signature");
    expect(verifyFlightLink({ ...LINK, passengers: 3 }, signature, SECRET, NOW)).toBe("invalid_signature");
    expect(verifyFlightLink({ ...LINK, context: "chat" }, signature, SECRET, NOW)).toBe("invalid_signature");
    expect(verifyFlightLink({ ...LINK, itineraryId: null }, signature, SECRET, NOW)).toBe("invalid_signature");
  });

  it("firma alterata: una lettera della firma cambiata", () => {
    const signature = signFlightLink(LINK, SECRET);
    const last = signature.slice(-1) === "A" ? "B" : "A";
    const tampered = `${signature.slice(0, -1)}${last}`;
    expect(verifyFlightLink(LINK, tampered, SECRET, NOW)).toBe("invalid_signature");
  });

  it("firma di lunghezza sbagliata o vuota: invalid_signature senza eccezioni", () => {
    expect(verifyFlightLink(LINK, "", SECRET, NOW)).toBe("invalid_signature");
    expect(verifyFlightLink(LINK, "abc", SECRET, NOW)).toBe("invalid_signature");
    expect(verifyFlightLink(LINK, signFlightLink(LINK, SECRET).slice(0, 20), SECRET, NOW)).toBe("invalid_signature");
  });

  it("chiave diversa: firma non valida", () => {
    const signature = signFlightLink(LINK, SECRET);
    expect(verifyFlightLink(LINK, signature, "altra-chiave", NOW)).toBe("invalid_signature");
  });

  it("firma scaduta: expired, con la scadenza a exp (exp <= ora)", () => {
    const expired: FlightLink = { ...LINK, expiresAt: NOW };
    const signature = signFlightLink(expired, SECRET);
    expect(verifyFlightLink(expired, signature, SECRET, NOW)).toBe("expired");
    expect(verifyFlightLink(expired, signature, SECRET, NOW + 1)).toBe("expired");
    expect(verifyFlightLink(expired, signature, SECRET, NOW - 1)).toBe("ok");
  });

  it("exp alterato dopo la firma: invalid_signature, non expired", () => {
    const signature = signFlightLink(LINK, SECRET);
    expect(verifyFlightLink({ ...LINK, expiresAt: NOW + 86_400 * 30 }, signature, SECRET, NOW)).toBe("invalid_signature");
  });

  it("senza segreto: missing_secret e nessuna firma con chiave vuota", () => {
    expect(verifyFlightLink(LINK, "anything", undefined, NOW)).toBe("missing_secret");
    expect(verifyFlightLink(LINK, "anything", "", NOW)).toBe("missing_secret");
    expect(() => signFlightLink(LINK, undefined)).toThrow();
    expect(() => signFlightLink(LINK, "")).toThrow();
  });
});

describe("parseFlightLinkQuery / flightLinkHref", () => {
  it("il link generato si rilegge uguale", () => {
    const href = flightLinkHref(LINK, SECRET, "it");
    expect(href.startsWith("/api/go/flight?")).toBe(true);
    const query = new URL(href, "https://app.example").searchParams;
    const parsed = parseFlightLinkQuery(query);
    expect(parsed).not.toBeNull();
    expect(parsed?.link).toEqual(LINK);
    expect(verifyFlightLink(parsed!.link, parsed!.signature, SECRET, NOW)).toBe("ok");
    expect(query.get("l")).toBe("it");
  });

  it("parametri mancanti o malformati: null", () => {
    const base = new URL(flightLinkHref(LINK, SECRET, "it"), "https://app.example").searchParams;
    const without = (key: string) => {
      const copy = new URLSearchParams(base);
      copy.delete(key);
      return copy;
    };
    expect(parseFlightLinkQuery(without("o"))).toBeNull();
    expect(parseFlightLinkQuery(without("exp"))).toBeNull();
    const badContext = new URLSearchParams(base);
    badContext.set("c", "evil");
    expect(parseFlightLinkQuery(badContext)).toBeNull();
    const badPax = new URLSearchParams(base);
    badPax.set("pax", "0");
    expect(parseFlightLinkQuery(badPax)).toBeNull();
    const badOrigin = new URLSearchParams(base);
    badOrigin.set("o", "https://evil.example");
    expect(parseFlightLinkQuery(badOrigin)).toBeNull();
  });

  it("parametri estranei (url, target) non cambiano il link letto", () => {
    const query = new URL(flightLinkHref(LINK, SECRET, "it"), "https://app.example").searchParams;
    query.set("url", "https://evil.example");
    query.set("target", "https://evil.example");
    const parsed = parseFlightLinkQuery(query);
    expect(parsed?.link).toEqual(LINK);
  });
});
