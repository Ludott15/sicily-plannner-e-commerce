import { describe, expect, it } from "vitest";
import { AIRPORT_RESULTS_MAX, AIRPORT_QUERY_MAX_LENGTH, airportsResponseSchema } from "@/lib/flights/airport-api";
import { searchAirportsForCombobox } from "./airport-search";

describe("searchAirportsForCombobox", () => {
  it("testo vuoto: nessun aeroporto, ma richiesta valida", () => {
    expect(searchAirportsForCombobox({ q: "" })).toEqual({ ok: true, airports: [] });
  });

  it("rifiuta un testo troppo lungo", () => {
    expect(searchAirportsForCombobox({ q: "a".repeat(AIRPORT_QUERY_MAX_LENGTH + 1) })).toEqual({ ok: false, error: "invalid" });
  });

  it("rifiuta input che non è un oggetto con q", () => {
    expect(searchAirportsForCombobox(null)).toEqual({ ok: false, error: "invalid" });
    expect(searchAirportsForCombobox({ q: 3 })).toEqual({ ok: false, error: "invalid" });
  });

  it("al massimo 12 aeroporti, nello schema della risposta", () => {
    const result = searchAirportsForCombobox({ q: "a" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.airports.length).toBeLessThanOrEqual(AIRPORT_RESULTS_MAX);
    expect(airportsResponseSchema.safeParse({ airports: result.airports }).success).toBe(true);
  });

  it("cerca per città e per paese", () => {
    const city = searchAirportsForCombobox({ q: "New York" });
    expect(city.ok && city.airports.map((a) => a.iata)).toContain("JFK");
    const country = searchAirportsForCombobox({ q: "Giappone" });
    expect(country.ok && country.airports.length > 0 && country.airports.every((a) => a.country === "JP")).toBe(true);
  });
});
