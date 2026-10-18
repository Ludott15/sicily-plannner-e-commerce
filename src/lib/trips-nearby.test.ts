import { describe, expect, it } from "vitest";
import { addDays, nearestSicilyAirport } from "./trips";

describe("addDays", () => {
  it("somma giorni al calendario, anche oltre fine mese e negli anni bisestili", () => {
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("nearestSicilyAirport", () => {
  it("sceglie l'aeroporto più vicino al centro dei punti", () => {
    expect(nearestSicilyAirport([{ lat: 37.5, lng: 15.09 }])).toBe("CTA"); // Catania
    expect(nearestSicilyAirport([{ lat: 38.12, lng: 13.36 }])).toBe("PMO"); // Palermo
    expect(nearestSicilyAirport([{ lat: 36.8, lng: 11.95 }])).toBe("PNL"); // Pantelleria
  });

  it("senza punti: null", () => {
    expect(nearestSicilyAirport([])).toBeNull();
  });
});
