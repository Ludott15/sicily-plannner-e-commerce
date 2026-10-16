import { describe, expect, it } from "vitest";
import { AVIASALES_HOST, buildAviasalesUrl, InvalidAviasalesSearchError, safeMarker, type AviasalesSearch } from "./aviasales";

const BASE: AviasalesSearch = {
  origin: "FCO",
  destination: "CTA",
  departure: "2026-11-03",
  returnDate: null,
  passengers: 2,
  subId: "abcdef0123456789",
  marker: "123456",
  locale: "it",
};

describe("buildAviasalesUrl", () => {
  it("andata: percorso origine + DDMM + destinazione + passeggeri", () => {
    const url = buildAviasalesUrl(BASE);
    expect(url.origin).toBe(`https://${AVIASALES_HOST}`);
    expect(url.pathname).toBe("/search/FCO0311CTA2");
    expect(url.searchParams.get("marker")).toBe("123456");
    expect(url.searchParams.get("sub_id")).toBe("abcdef0123456789");
    expect(url.searchParams.get("currency")).toBe("eur");
    expect(url.searchParams.get("locale")).toBe("it");
  });

  it("andata e ritorno: aggiunge il DDMM del ritorno dopo la destinazione", () => {
    const url = buildAviasalesUrl({ ...BASE, returnDate: "2026-11-10", passengers: 1 });
    expect(url.pathname).toBe("/search/FCO0311CTA10111");
  });

  it("senza marker il parametro non compare", () => {
    const url = buildAviasalesUrl({ ...BASE, marker: null });
    expect(url.searchParams.has("marker")).toBe(false);
    expect(url.searchParams.get("sub_id")).toBe("abcdef0123456789");
  });

  it("l'host è sempre quello fisso, anche con valori che sembrano URL", () => {
    expect(() => buildAviasalesUrl({ ...BASE, origin: "evil.example/x" })).toThrow(InvalidAviasalesSearchError);
    expect(() => buildAviasalesUrl({ ...BASE, destination: "https://evil.example" })).toThrow(InvalidAviasalesSearchError);
    expect(() => buildAviasalesUrl({ ...BASE, locale: "../it" })).toThrow(InvalidAviasalesSearchError);
    expect(buildAviasalesUrl(BASE).hostname).toBe(AVIASALES_HOST);
  });

  it("rifiuta date, passeggeri, sub_id e marker non validi", () => {
    expect(() => buildAviasalesUrl({ ...BASE, departure: "03/11/2026" })).toThrow("departure");
    expect(() => buildAviasalesUrl({ ...BASE, returnDate: "2026-1-1" })).toThrow("returnDate");
    expect(() => buildAviasalesUrl({ ...BASE, passengers: 0 })).toThrow("passengers");
    expect(() => buildAviasalesUrl({ ...BASE, passengers: 10 })).toThrow("passengers");
    expect(() => buildAviasalesUrl({ ...BASE, subId: "ABC" })).toThrow("subId");
    expect(() => buildAviasalesUrl({ ...BASE, marker: "a b" })).toThrow("marker");
  });

  it("il sub_id compare nella query così com'è", () => {
    expect(buildAviasalesUrl(BASE).search).toContain("sub_id=abcdef0123456789");
  });
});

describe("safeMarker", () => {
  it("accetta un marker alfanumerico e ignora tutto il resto", () => {
    expect(safeMarker("123456")).toBe("123456");
    expect(safeMarker(" 123456 ")).toBe("123456");
    expect(safeMarker("")).toBeNull();
    expect(safeMarker(undefined)).toBeNull();
    expect(safeMarker("12&sub_id=evil")).toBeNull();
  });
});
