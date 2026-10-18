import { describe, expect, it } from "vitest";
import {
  buildVerticalUrl,
  checkVerticalLink,
  parseVerticalLinkQuery,
  verticalLinkHref,
  type PartnerTemplate,
  type VerticalLink,
} from "./vertical-links";

const SECRET = "test-secret-do-not-use-in-prod";
const NOW = 1_800_000_000;
const ITINERARY = "0f1e2d3c-4b5a-4968-8777-665544332211";
const SUBID = "abcdef0123456789";

const BOOKING: PartnerTemplate = {
  searchUrlTemplate:
    "https://www.booking.com/searchresults.html?ss={query}&checkin={checkin}&checkout={checkout}&group_adults={adults}&aid={partner_id}&label={subid}&lang={locale}",
  allowedHosts: ["www.booking.com"],
  subidParam: "label",
};

const VALUES = {
  query: "Taormina",
  checkin: "2026-11-03",
  checkout: "2026-11-05",
  adults: "2",
  partner_id: "12345",
  locale: "it",
};

const LINK: VerticalLink = {
  partner: "booking",
  vertical: "lodging",
  query: "Taormina",
  airport: "",
  checkin: "2026-11-03",
  checkout: "2026-11-05",
  adults: 2,
  context: "itinerary",
  itineraryId: ITINERARY,
  expiresAt: NOW + 3600,
};

describe("buildVerticalUrl", () => {
  it("costruisce l'URL con il subid nel parametro del partner, https e host ammesso", () => {
    const out = buildVerticalUrl(BOOKING, { ...VALUES, subid: SUBID });
    expect(out).not.toBeNull();
    const url = new URL(out!);
    expect(url.origin).toBe("https://www.booking.com");
    expect(url.searchParams.get("label")).toBe(SUBID);
    expect(url.searchParams.get("aid")).toBe("12345");
    expect(url.searchParams.get("group_adults")).toBe("2");
  });

  it("nessun link senza subid", () => {
    expect(buildVerticalUrl(BOOKING, VALUES)).toBeNull();
    expect(buildVerticalUrl(BOOKING, { ...VALUES, subid: "" })).toBeNull();
  });

  it("nessun link se il template non porta il subid del click (parametro del subid assente)", () => {
    const withoutSubid: PartnerTemplate = { ...BOOKING, searchUrlTemplate: BOOKING.searchUrlTemplate.replace("&label={subid}", "") };
    expect(buildVerticalUrl(withoutSubid, { ...VALUES, subid: SUBID })).toBeNull();
    expect(buildVerticalUrl({ ...BOOKING, subidParam: null }, { ...VALUES, subid: SUBID })).toBeNull();
  });

  it("host fuori dall'allowlist: nessun link, anche con nomi che lo imitano", () => {
    const evil = (url: string): PartnerTemplate => ({ ...BOOKING, searchUrlTemplate: url });
    const values = { ...VALUES, subid: SUBID };
    expect(buildVerticalUrl(evil("https://evil.example/s?label={subid}"), values)).toBeNull();
    expect(buildVerticalUrl(evil("https://www.booking.com.evil.example/s?label={subid}"), values)).toBeNull();
    expect(buildVerticalUrl(evil("https://www.booking.com@evil.example/s?label={subid}"), values)).toBeNull();
    expect(buildVerticalUrl(evil("https://evil.example\\@www.booking.com/s?label={subid}"), values)).toBeNull();
    expect(buildVerticalUrl(evil("https://user:pw@www.booking.com/s?label={subid}"), values)).toBeNull();
    expect(buildVerticalUrl(evil("https://www.booking.com:8443/s?label={subid}"), values)).toBeNull();
  });

  it("solo https: http e template senza schema non passano", () => {
    const values = { ...VALUES, subid: SUBID };
    expect(buildVerticalUrl({ ...BOOKING, searchUrlTemplate: BOOKING.searchUrlTemplate.replace("https", "http") }, values)).toBeNull();
    expect(buildVerticalUrl({ ...BOOKING, searchUrlTemplate: "//www.booking.com/s?label={subid}" }, values)).toBeNull();
  });

  it("segnaposto codificati: un valore con caratteri speciali non cambia struttura né host", () => {
    const raw = "Giardini & Naxos?#/x=y";
    const out = buildVerticalUrl(BOOKING, { ...VALUES, query: raw, subid: SUBID });
    expect(out).not.toBeNull();
    const url = new URL(out!);
    expect(url.searchParams.get("ss")).toBe(raw);
    expect(url.hash).toBe("");
    expect(url.hostname).toBe("www.booking.com");
    expect(out).toContain("ss=Giardini%20%26%20Naxos%3F%23%2Fx%3Dy");
  });

  it("valore mancante per un segnaposto usato: nessun link", () => {
    expect(buildVerticalUrl(BOOKING, { ...VALUES, query: "", subid: SUBID })).toBeNull();
    expect(buildVerticalUrl(BOOKING, { ...VALUES, checkin: undefined, subid: SUBID })).toBeNull();
  });

  it("segnaposto sconosciuto nel template: nessun link", () => {
    const unknown: PartnerTemplate = { ...BOOKING, searchUrlTemplate: `${BOOKING.searchUrlTemplate}&x={password}` };
    expect(buildVerticalUrl(unknown, { ...VALUES, subid: SUBID })).toBeNull();
  });

  it("l'allowlist non distingue le maiuscole", () => {
    const upper: PartnerTemplate = { ...BOOKING, allowedHosts: ["WWW.Booking.com"] };
    expect(buildVerticalUrl(upper, { ...VALUES, subid: SUBID })).not.toBeNull();
  });
});

describe("firma dei link di alloggi e noleggi", () => {
  it("il link generato si rilegge uguale e la firma è valida", () => {
    const href = verticalLinkHref(LINK, SECRET, "it");
    expect(href.startsWith("/api/go/v?")).toBe(true);
    const parsed = parseVerticalLinkQuery(new URL(href, "https://app.example").searchParams);
    expect(parsed?.link).toEqual(LINK);
    expect(checkVerticalLink(parsed!.link, parsed!.signature, SECRET, NOW)).toBe("ok");
  });

  it("firma alterata: query, area o aeroporto cambiati", () => {
    const parsed = parseVerticalLinkQuery(new URL(verticalLinkHref(LINK, SECRET, "it"), "https://app.example").searchParams);
    expect(checkVerticalLink({ ...parsed!.link, query: "Palermo" }, parsed!.signature, SECRET, NOW)).toBe("invalid_signature");
    expect(checkVerticalLink({ ...parsed!.link, partner: "evil" }, parsed!.signature, SECRET, NOW)).toBe("invalid_signature");
    expect(checkVerticalLink({ ...parsed!.link, vertical: "car" }, parsed!.signature, SECRET, NOW)).toBe("invalid_signature");
  });

  it("scaduto: expired; chiave assente: missing_secret", () => {
    const expired = { ...LINK, expiresAt: NOW };
    const signature = verticalLinkHref(expired, SECRET, "it").split("&s=")[1]!.split("&")[0]!;
    expect(checkVerticalLink(expired, signature, SECRET, NOW)).toBe("expired");
    expect(checkVerticalLink(LINK, signature, undefined, NOW)).toBe("missing_secret");
    expect(() => verticalLinkHref(LINK, undefined, "it")).toThrow();
  });

  it("valori fuori formato rifiutati: aeroporto non siciliano, data, persone, contesto, separatore", () => {
    const signature = "x".repeat(43);
    expect(checkVerticalLink({ ...LINK, airport: "FCO" }, signature, SECRET, NOW)).toBe("invalid_signature");
    expect(checkVerticalLink({ ...LINK, checkin: "2026-02-30" }, signature, SECRET, NOW)).toBe("invalid_signature");
    expect(checkVerticalLink({ ...LINK, adults: 0 }, signature, SECRET, NOW)).toBe("invalid_signature");
    expect(checkVerticalLink({ ...LINK, adults: 31 }, signature, SECRET, NOW)).toBe("invalid_signature");
    expect(checkVerticalLink({ ...LINK, context: "evil" as VerticalLink["context"] }, signature, SECRET, NOW)).toBe(
      "invalid_signature",
    );
    expect(checkVerticalLink({ ...LINK, query: "a|b" }, signature, SECRET, NOW)).toBe("invalid_signature");
    expect(checkVerticalLink({ ...LINK, partner: "Booking" }, signature, SECRET, NOW)).toBe("invalid_signature");
  });

  it("parametri mancanti o malformati: null; parametri estranei ignorati", () => {
    const base = new URL(verticalLinkHref(LINK, SECRET, "it"), "https://app.example").searchParams;
    const without = (key: string) => {
      const copy = new URLSearchParams(base);
      copy.delete(key);
      return copy;
    };
    expect(parseVerticalLinkQuery(without("partner"))).toBeNull();
    expect(parseVerticalLinkQuery(without("s"))).toBeNull();
    const badVertical = new URLSearchParams(base);
    badVertical.set("vertical", "flight");
    expect(parseVerticalLinkQuery(badVertical)).toBeNull();
    const extra = new URLSearchParams(base);
    extra.set("url", "https://evil.example");
    extra.set("host", "evil.example");
    expect(parseVerticalLinkQuery(extra)?.link).toEqual(LINK);
  });
});
