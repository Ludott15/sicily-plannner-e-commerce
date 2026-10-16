import { describe, expect, it } from "vitest";
import { parseDashboardRange } from "./range";

// Periodo della dashboard: pura, nessun database.

const TODAY = "2026-10-16";

describe("parseDashboardRange", () => {
  it("senza parametri: gli ultimi 30 giorni, oggi incluso", () => {
    expect(parseDashboardRange({}, TODAY)).toEqual({ from: "2026-09-17", to: "2026-10-16" });
  });

  it("usa le date valide così come sono (estremi inclusi)", () => {
    expect(parseDashboardRange({ da: "2026-01-01", a: "2026-03-31" }, TODAY)).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(parseDashboardRange({ da: "2026-05-10", a: "2026-05-10" }, TODAY)).toEqual({ from: "2026-05-10", to: "2026-05-10" });
  });

  it("con solo la data di inizio la fine è oggi", () => {
    expect(parseDashboardRange({ da: "2026-10-01" }, TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-16" });
  });

  it("con solo la data di fine l'inizio è 30 giorni prima", () => {
    expect(parseDashboardRange({ a: "2026-06-30" }, TODAY)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("date non valide: si usa il default", () => {
    expect(parseDashboardRange({ da: "2026-02-30", a: "ieri" }, TODAY)).toEqual({ from: "2026-09-17", to: "2026-10-16" });
    expect(parseDashboardRange({ da: "2026-1-1", a: "2026-01-31T00:00" }, TODAY)).toEqual({ from: "2026-09-17", to: "2026-10-16" });
  });

  it("da dopo a: torna il default che termina su a", () => {
    expect(parseDashboardRange({ da: "2026-05-10", a: "2026-05-01" }, TODAY)).toEqual({ from: "2026-04-02", to: "2026-05-01" });
  });

  it("massimo 366 giorni: il periodo si accorcia tenendo la fine", () => {
    const range = parseDashboardRange({ da: "2020-01-01", a: "2026-10-16" }, TODAY);
    expect(range).toEqual({ from: "2025-10-16", to: "2026-10-16" });
    const edge = parseDashboardRange({ da: "2025-10-16", a: "2026-10-16" }, TODAY);
    expect(edge).toEqual({ from: "2025-10-16", to: "2026-10-16" });
  });

  it("gestisce il passaggio di anno e di bisestile", () => {
    expect(parseDashboardRange({ da: "2028-02-29", a: "2028-03-01" }, TODAY)).toEqual({ from: "2028-02-29", to: "2028-03-01" });
    expect(parseDashboardRange({}, "2027-01-10")).toEqual({ from: "2026-12-12", to: "2027-01-10" });
  });
});
