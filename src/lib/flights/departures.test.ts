import { describe, expect, it } from "vitest";
import { countryName } from "./airport-api";
import { SICILY_AIRPORT_CODES } from "./airports";
import { DEPARTURE_AIRPORTS, getDeparture, normalizeSearchText, searchDepartures } from "./departures";

describe("elenco partenze", () => {
  it("codici IATA unici, paese ISO-2 e nessun aeroporto siciliano", () => {
    const codes = DEPARTURE_AIRPORTS.map((a) => a.iata);
    expect(new Set(codes).size).toBe(codes.length);
    for (const airport of DEPARTURE_AIRPORTS) {
      expect(airport.iata).toMatch(/^[A-Z]{3}$/);
      expect(airport.country).toMatch(/^[A-Z]{2}$/);
      expect((SICILY_AIRPORT_CODES as readonly string[]).includes(airport.iata)).toBe(false);
    }
  });

  it("elenco mondiale: centinaia di aeroporti in più paesi, non solo in Europa", () => {
    expect(DEPARTURE_AIRPORTS.length).toBeGreaterThan(2500);
    const countries = new Set(DEPARTURE_AIRPORTS.map((a) => a.country));
    expect(countries.size).toBeGreaterThan(150);
    expect(countries.has("US")).toBe(true);
    expect(countries.has("JP")).toBe(true);
    expect(countries.has("BR")).toBe(true);
  });

  it("getDeparture accetta il codice in qualsiasi maiuscola, anche fuori dall'Europa", () => {
    expect(getDeparture("fco")?.city_it).toBe("Roma");
    expect(getDeparture("jfk")?.city_it).toBe("Nuova York");
    expect(getDeparture("XXX")).toBeNull();
    expect(getDeparture("CTA")).toBeNull();
  });
});

describe("normalizeSearchText", () => {
  it("toglie accenti e maiuscole, riduce i separatori a spazio", () => {
    expect(normalizeSearchText("  Düsseldorf ")).toBe("dusseldorf");
    expect(normalizeSearchText("Reggio-Calabria")).toBe("reggio calabria");
    expect(normalizeSearchText("Forlì")).toBe("forli");
  });
});

describe("countryName", () => {
  it("nome del paese nella lingua richiesta", () => {
    expect(countryName("US", "it")).toBe("Stati Uniti");
    expect(countryName("US", "en")).toBe("United States");
    expect(countryName("XX", "it")).toBe("XX");
  });
});

describe("searchDepartures", () => {
  it("ricerca vuota o di soli separatori: nessun risultato", () => {
    expect(searchDepartures("")).toEqual([]);
    expect(searchDepartures("   ")).toEqual([]);
    expect(searchDepartures("---")).toEqual([]);
  });

  it("trova per codice IATA esatto come primo risultato", () => {
    expect(searchDepartures("FCO")[0]?.iata).toBe("FCO");
    expect(searchDepartures("fco")[0]?.iata).toBe("FCO");
    expect(searchDepartures("JFK")[0]?.iata).toBe("JFK");
  });

  it("trova per città senza accenti e maiuscole", () => {
    expect(searchDepartures("dusseldorf")[0]?.iata).toBe("DUS");
    expect(searchDepartures("DÜSSELDORF")[0]?.iata).toBe("DUS");
  });

  it("trova per nome dell'aeroporto e per parole del nome", () => {
    expect(searchDepartures("fiumicino")[0]?.iata).toBe("FCO");
    expect(searchDepartures("roma fiu")[0]?.iata).toBe("FCO");
    expect(searchDepartures("gatwick")[0]?.iata).toBe("LGW");
  });

  it("trova New York, anche in inglese, e i suoi aeroporti", () => {
    const codes = searchDepartures("New York", 12).map((a) => a.iata);
    expect(codes).toContain("JFK");
    expect(searchDepartures("nuova york", 12).map((a) => a.iata)).toContain("JFK");
  });

  it("per città restituisce tutti gli aeroporti della città", () => {
    const codes = searchDepartures("milano", 10).map((a) => a.iata);
    expect(codes).toEqual(expect.arrayContaining(["MXP", "LIN"]));
  });

  it("trova per paese nella lingua della ricerca", () => {
    const results = searchDepartures("stati uniti", 12);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((a) => a.country === "US")).toBe(true);
    expect(searchDepartures("united states", 12).every((a) => a.country === "US")).toBe(true);
  });

  it("i prefissi dei codici e delle città contano più delle parole interne", () => {
    const results = searchDepartures("london", 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results.slice(0, 2).every((a) => a.city_en === "London")).toBe(true);
  });

  it("nessuna corrispondenza restituisce un elenco vuoto", () => {
    expect(searchDepartures("zzzqqq")).toEqual([]);
  });

  it("rispetta il limite e non ripete aeroporti", () => {
    const results = searchDepartures("a", 5);
    expect(results.length).toBeLessThanOrEqual(5);
    expect(new Set(results.map((a) => a.iata)).size).toBe(results.length);
    expect(searchDepartures("roma", 0)).toEqual([]);
  });
});
