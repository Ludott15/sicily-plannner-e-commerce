import { describe, expect, it } from "vitest";
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

  it("circa 120 aeroporti", () => {
    expect(DEPARTURE_AIRPORTS.length).toBeGreaterThanOrEqual(110);
    expect(DEPARTURE_AIRPORTS.length).toBeLessThanOrEqual(130);
  });

  it("getDeparture accetta il codice in qualsiasi maiuscola", () => {
    expect(getDeparture("fco")?.city_it).toBe("Roma");
    expect(getDeparture("XXX")).toBeNull();
  });
});

describe("normalizeSearchText", () => {
  it("toglie accenti e maiuscole, riduce i separatori a spazio", () => {
    expect(normalizeSearchText("  Düsseldorf ")).toBe("dusseldorf");
    expect(normalizeSearchText("Reggio-Calabria")).toBe("reggio calabria");
    expect(normalizeSearchText("Forlì")).toBe("forli");
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

  it("per città restituisce tutti gli aeroporti della città", () => {
    const codes = searchDepartures("milano", 10).map((a) => a.iata);
    expect(codes).toEqual(expect.arrayContaining(["MXP", "LIN"]));
  });

  it("i prefissi dei codici e delle città contano più delle parole interne", () => {
    const results = searchDepartures("lon", 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((a) => a.city_en === "London" || a.iata.startsWith("LON"))).toBe(true);
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
