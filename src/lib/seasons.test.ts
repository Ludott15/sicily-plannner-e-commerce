import { describe, expect, it } from "vitest";
import { isSeasonKey, publicNameOf, seasonOf, seasonRange } from "./seasons";

describe("seasonOf", () => {
  it("usa l'ora italiana ai confini di aprile e ottobre", () => {
    // 31 marzo 2026 alle 23:59 a Roma (ora legale, +2): ancora inverno.
    expect(seasonOf(new Date("2026-03-31T21:59:00Z"))).toBe("2025-inverno");
    // 1 aprile 2026 alle 00:00 a Roma: estate.
    expect(seasonOf(new Date("2026-03-31T22:00:00Z"))).toBe("2026-estate");
    // 30 settembre 2026 alle 23:59 a Roma: estate.
    expect(seasonOf(new Date("2026-09-30T21:59:00Z"))).toBe("2026-estate");
    // 1 ottobre 2026 alle 00:00 a Roma: inverno.
    expect(seasonOf(new Date("2026-09-30T22:00:00Z"))).toBe("2026-inverno");
  });

  it("etichetta gennaio con l'anno in cui inizia l'inverno", () => {
    expect(seasonOf(new Date("2027-01-15T12:00:00Z"))).toBe("2026-inverno");
  });

  it("usa il mese di Roma anche quando in UTC è ancora il mese prima", () => {
    // 1 aprile 2027 alle 00:30 a Roma sono le 22:30 del 31 marzo in UTC.
    expect(seasonOf(new Date("2027-03-31T22:30:00Z"))).toBe("2027-estate");
  });
});

describe("seasonRange", () => {
  it("restituisce l'estate da aprile a ottobre, a mezzanotte di Roma", () => {
    const range = seasonRange("2026-estate");
    expect(range.from.toISOString()).toBe("2026-03-31T22:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  it("restituisce l'inverno da ottobre ad aprile dell'anno dopo", () => {
    const range = seasonRange("2026-inverno");
    expect(range.from.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(range.to.toISOString()).toBe("2027-03-31T22:00:00.000Z");
  });

  it("le date di una stagione ricadono nella stessa stagione", () => {
    const range = seasonRange("2026-estate");
    expect(seasonOf(range.from)).toBe("2026-estate");
    expect(seasonOf(new Date(range.to.getTime() - 1))).toBe("2026-estate");
    expect(seasonOf(range.to)).toBe("2026-inverno");
  });

  it("rifiuta una chiave non valida", () => {
    expect(() => seasonRange("2026-autunno")).toThrow("invalid_season");
  });
});

describe("isSeasonKey", () => {
  it("accetta solo il formato di public.season_for", () => {
    expect(isSeasonKey("2026-estate")).toBe(true);
    expect(isSeasonKey("2026-inverno")).toBe(true);
    expect(isSeasonKey("2026-summer")).toBe(false);
    expect(isSeasonKey("26-estate")).toBe(false);
  });
});

describe("publicNameOf", () => {
  it("usa il nome pubblico scelto, senza spazi ai bordi", () => {
    expect(publicNameOf("  Giulia  ", "Mario Rossi")).toBe("Giulia");
  });

  it("ripiega sulle iniziali del nome dell'account", () => {
    expect(publicNameOf(null, "Mario Rossi")).toBe("M. R.");
    expect(publicNameOf("   ", "Mario Rossi")).toBe("M. R.");
    expect(publicNameOf(null, "Mario Giuseppe Rossi")).toBe("M. R.");
    expect(publicNameOf(null, "Mario")).toBe("M.");
  });

  it("senza nessun nome non espone nulla di identificativo", () => {
    expect(publicNameOf(null, null)).toBe("Viaggiatore");
    expect(publicNameOf(null, "   ")).toBe("Viaggiatore");
  });
});
