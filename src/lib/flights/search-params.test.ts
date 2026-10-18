import { describe, expect, it } from "vitest";
import {
  flightSearchPath,
  isIsoDate,
  parseFlightSearchParams,
  serializeFlightSearchParams,
} from "./search-params";

const ID = "0f1e2d3c-4b5a-4968-8777-665544332211";

describe("isIsoDate", () => {
  it("accetta solo date reali nel formato YYYY-MM-DD", () => {
    expect(isIsoDate("2026-10-15")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("15/10/2026")).toBe(false);
    expect(isIsoDate("2026-10-15T00:00")).toBe(false);
  });
});

describe("parseFlightSearchParams", () => {
  it("valori validi: da, a, andata, ritorno, persone, viaggio", () => {
    const parsed = parseFlightSearchParams({
      da: "fco",
      a: "CTA",
      andata: "2026-11-03",
      ritorno: "2026-11-10",
      persone: "3",
      viaggio: ID.toUpperCase(),
    });
    expect(parsed).toEqual({
      origin: "FCO",
      destination: "CTA",
      departure: "2026-11-03",
      returnDate: "2026-11-10",
      passengers: 3,
      itineraryId: ID,
    });
  });

  it("senza parametri: tutto vuoto e un passeggero", () => {
    expect(parseFlightSearchParams({})).toEqual({
      origin: null,
      destination: null,
      departure: null,
      returnDate: null,
      passengers: 1,
      itineraryId: null,
    });
  });

  it("arrivo fuori dall'elenco siciliano è scartato, LMP e PNL sono validi", () => {
    expect(parseFlightSearchParams({ a: "LIN" }).destination).toBeNull();
    expect(parseFlightSearchParams({ a: "PMO2" }).destination).toBeNull();
    expect(parseFlightSearchParams({ a: "lmp" }).destination).toBe("LMP");
    expect(parseFlightSearchParams({ a: "pnl" }).destination).toBe("PNL");
  });

  it("partenza che non è un codice IATA di tre lettere è scartata", () => {
    expect(parseFlightSearchParams({ da: "ROMA" }).origin).toBeNull();
    expect(parseFlightSearchParams({ da: "F1O" }).origin).toBeNull();
    expect(parseFlightSearchParams({ da: "<script>" }).origin).toBeNull();
  });

  it("il ritorno prima dell'andata o senza andata è scartato: ricerca di sola andata", () => {
    expect(parseFlightSearchParams({ andata: "2026-11-10", ritorno: "2026-11-03" }).returnDate).toBeNull();
    expect(parseFlightSearchParams({ ritorno: "2026-11-03" }).returnDate).toBeNull();
    expect(parseFlightSearchParams({ andata: "2026-11-03", ritorno: "2026-11-03" }).returnDate).toBe("2026-11-03");
  });

  it("date non valide sono scartate", () => {
    expect(parseFlightSearchParams({ andata: "2026-02-30" }).departure).toBeNull();
    expect(parseFlightSearchParams({ andata: "domani" }).departure).toBeNull();
  });

  it("passeggeri fuori da 1..9 o non numerici valgono 1", () => {
    for (const persone of ["0", "10", "-2", "2.5", "abc", ""]) {
      expect(parseFlightSearchParams({ persone }).passengers).toBe(1);
    }
    expect(parseFlightSearchParams({ persone: "9" }).passengers).toBe(9);
  });

  it("viaggio non uuid è scartato", () => {
    expect(parseFlightSearchParams({ viaggio: "non-un-id" }).itineraryId).toBeNull();
  });

  it("con più valori per lo stesso nome vale il primo", () => {
    expect(parseFlightSearchParams({ a: ["PMO", "CTA"] }).destination).toBe("PMO");
  });

  it("parametri estranei (url, target) non entrano nel risultato", () => {
    const parsed = parseFlightSearchParams({ url: "https://evil.example", target: "x", da: "FCO" });
    expect(Object.keys(parsed).sort()).toEqual(
      ["departure", "destination", "itineraryId", "origin", "passengers", "returnDate"].sort(),
    );
  });
});

describe("serializeFlightSearchParams", () => {
  it("serializza nell'ordine fisso e solo i valori presenti", () => {
    expect(
      serializeFlightSearchParams({
        origin: "FCO",
        destination: "CTA",
        departure: "2026-11-03",
        returnDate: "2026-11-10",
        passengers: 2,
        itineraryId: ID,
      }),
    ).toBe(`da=FCO&a=CTA&andata=2026-11-03&ritorno=2026-11-10&persone=2&viaggio=${ID}`);
    expect(serializeFlightSearchParams({ destination: "PNL" })).toBe("a=PNL");
    expect(serializeFlightSearchParams({})).toBe("");
  });

  it("round trip: parse(serialize(x)) torna x per i valori validi", () => {
    const params = {
      origin: "MXP",
      destination: "PMO" as const,
      departure: "2026-12-24",
      returnDate: null,
      passengers: 4,
      itineraryId: null,
    };
    const query = serializeFlightSearchParams(params);
    expect(parseFlightSearchParams(Object.fromEntries(new URLSearchParams(query)))).toEqual(params);
  });
});

describe("flightSearchPath", () => {
  it("costruisce il percorso localizzato, senza ? se la ricerca è vuota", () => {
    expect(flightSearchPath("it", {})).toBe("/it/voli");
    expect(flightSearchPath("en", { origin: "FCO", destination: "LMP" })).toBe("/en/voli?da=FCO&a=LMP");
  });
});
