import { describe, expect, it } from "vitest";
import { consecutiveLegPairs, formatDistance, formatDuration } from "./legs";

describe("formatDuration", () => {
  it("scrive ore e minuti", () => {
    expect(formatDuration(4800, "it")).toBe("≈ 1 h 20 min");
    expect(formatDuration(4800, "en")).toBe("≈ 1 h 20 min");
  });

  it("scrive solo i minuti sotto l'ora e solo le ore allo scoccare", () => {
    expect(formatDuration(1500, "it")).toBe("≈ 25 min");
    expect(formatDuration(3600, "it")).toBe("≈ 1 h");
  });

  it("arrotonda al minuto e non scende sotto un minuto", () => {
    expect(formatDuration(20, "it")).toBe("≈ 1 min");
    expect(formatDuration(0, "en")).toBe("≈ 1 min");
  });
});

describe("formatDistance", () => {
  it("usa i metri sotto il chilometro", () => {
    expect(formatDistance(850.4, "it")).toBe("850 m");
  });

  it("usa un decimale sotto i 10 km, con la virgola in italiano", () => {
    expect(formatDistance(4500, "it")).toBe("4,5 km");
    expect(formatDistance(4500, "en")).toBe("4.5 km");
  });

  it("arrotonda i chilometri da 10 in su", () => {
    expect(formatDistance(62_000, "it")).toBe("62 km");
    expect(formatDistance(18_400, "en")).toBe("18 km");
  });
});

describe("consecutiveLegPairs", () => {
  it("collega ogni tappa alla successiva", () => {
    expect(consecutiveLegPairs(["a", "b", "c"])).toEqual([
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ]);
  });

  it("salta le tappe senza luogo e collega i luoghi ai lati", () => {
    expect(consecutiveLegPairs(["a", null, "b", undefined, "", "c"])).toEqual([
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ]);
  });

  it("non crea tratte tra due tappe dello stesso luogo", () => {
    expect(consecutiveLegPairs(["a", "a", "b", "b", "a"])).toEqual([
      { from: "a", to: "b" },
      { from: "b", to: "a" },
    ]);
  });

  it("restituisce nulla per meno di due luoghi", () => {
    expect(consecutiveLegPairs(["a"])).toEqual([]);
    expect(consecutiveLegPairs([])).toEqual([]);
  });
});
