import { describe, expect, it } from "vitest";
import { formatDriveTime, formatDuration, formatEur, formatSeason } from "./format";

describe("formatDuration", () => {
  it.each([
    [45, "45 min"],
    [120, "2 h"],
    [150, "2 h 30 min"],
  ])("%i minuti → %s", (min, expected) => {
    expect(formatDuration(min)).toBe(expected);
  });
});

describe("formatDriveTime", () => {
  it.each([
    [100, "1 h 40"],
    [60, "1 h"],
    [45, "45 min"],
    [125, "2 h 05"],
  ])("%i minuti di guida → %s", (min, expected) => {
    expect(formatDriveTime(min)).toBe(expected);
  });
});

describe("formatEur", () => {
  it("usa la valuta dell'offerta quando non è EUR", () => {
    expect(formatEur("45", "en", "USD")).toBe("$45");
  });

  it("null resta null", () => {
    expect(formatEur(null, "it")).toBeNull();
  });

  it("interi senza decimali, altrimenti due decimali", () => {
    // Intl separa importo e simbolo con uno spazio non divisibile (U+00A0).
    expect(formatEur("35.00", "it")).toBe("35 €");
    expect(formatEur("12.50", "it")).toBe("12,50 €");
  });
});

describe("formatSeason", () => {
  it("tutto l'anno o nessun mese → null", () => {
    expect(formatSeason([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "it")).toBeNull();
    expect(formatSeason([], "it")).toBeNull();
  });

  it("comprime i mesi consecutivi", () => {
    expect(formatSeason([5, 6, 7, 8, 9, 10], "it")).toBe("maggio – ottobre");
    expect(formatSeason([3, 4, 5, 6, 9, 10, 11], "en")).toBe("March – June, September – November");
  });
});
