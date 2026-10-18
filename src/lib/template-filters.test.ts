import { describe, expect, it } from "vitest";
import { NO_TEMPLATE_FILTERS, parseTemplateFilters, templateFiltersQuery } from "./template-filters";

const allowed = { areas: ["ovest", "interno"] };

describe("filtri degli itinerari pronti", () => {
  it("senza parametri nessun filtro", () => {
    expect(parseTemplateFilters({}, allowed)).toEqual(NO_TEMPLATE_FILTERS);
  });

  it("gruppi di giorni nell'ordine dei gruppi, sconosciuti ignorati", () => {
    expect(parseTemplateFilters({ giorni: "8+|nope|2-3" }, allowed).days).toEqual(["2-3", "8+"]);
  });

  it("8+ arriva dalla query string come '8 ' (il + diventa spazio) e resta 8+", () => {
    expect(parseTemplateFilters({ giorni: "8 " }, allowed).days).toEqual(["8+"]);
    expect(parseTemplateFilters({ giorni: "8" }, allowed).days).toEqual(["8+"]);
  });

  it("area solo se è tra quelle consentite", () => {
    expect(parseTemplateFilters({ area: "ovest" }, allowed).area).toBe("ovest");
    expect(parseTemplateFilters({ area: "altrove" }, allowed).area).toBeNull();
  });

  it("per solo tra i valori del vocabolario", () => {
    expect(parseTemplateFilters({ per: "family" }, allowed).party).toBe("family");
    expect(parseTemplateFilters({ per: "gruppo" }, allowed).party).toBeNull();
  });

  it("mese solo intero da 1 a 12", () => {
    expect(parseTemplateFilters({ mese: "7" }, allowed).month).toBe(7);
    expect(parseTemplateFilters({ mese: "12" }, allowed).month).toBe(12);
    expect(parseTemplateFilters({ mese: "13" }, allowed).month).toBeNull();
    expect(parseTemplateFilters({ mese: "0" }, allowed).month).toBeNull();
    expect(parseTemplateFilters({ mese: "7.5" }, allowed).month).toBeNull();
    expect(parseTemplateFilters({ mese: "luglio" }, allowed).month).toBeNull();
  });

  it("parametro ripetuto: vale il primo", () => {
    expect(parseTemplateFilters({ area: ["ovest", "interno"], mese: ["3", "4"] }, allowed)).toEqual({
      days: [],
      area: "ovest",
      party: null,
      month: 3,
    });
  });

  it("andata e ritorno tra filtri e query string", () => {
    const filters = { days: ["4-5" as const, "8+" as const], area: "interno", party: "friends" as const, month: 9 };
    expect(templateFiltersQuery(filters)).toEqual({ giorni: "4-5|8+", area: "interno", per: "friends", mese: "9" });
    expect(parseTemplateFilters(templateFiltersQuery(filters), allowed)).toEqual(filters);
  });

  it("senza filtri la query è vuota", () => {
    expect(templateFiltersQuery(NO_TEMPLATE_FILTERS)).toEqual({});
  });
});
