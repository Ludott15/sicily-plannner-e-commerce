import { describe, expect, it } from "vitest";
import { activityFiltersQuery, parseActivityFilters } from "./activity-filters";

const allowed = { interests: ["sea", "food_wine", "villages"], provinces: ["PA", "TP"] };

describe("filtri della lista attività", () => {
  it("senza parametri nessun filtro", () => {
    expect(parseActivityFilters({}, allowed)).toEqual({ interests: [], province: null });
  });

  it("interessi nell'ordine delle opzioni, sconosciuti ignorati", () => {
    expect(parseActivityFilters({ interessi: "villages,nope,sea" }, allowed).interests).toEqual(["sea", "villages"]);
  });

  it("provincia valida anche in minuscolo, sconosciuta ignorata", () => {
    expect(parseActivityFilters({ provincia: "tp" }, allowed).province).toBe("TP");
    expect(parseActivityFilters({ provincia: "XX" }, allowed).province).toBeNull();
  });

  it("parametro ripetuto: vale il primo", () => {
    expect(parseActivityFilters({ interessi: ["sea", "villages"], provincia: ["PA", "TP"] }, allowed)).toEqual({
      interests: ["sea"],
      province: "PA",
    });
  });

  it("andata e ritorno tra filtri e query string", () => {
    const filters = { interests: ["sea", "food_wine"], province: "TP" };
    expect(activityFiltersQuery(filters)).toEqual({ interessi: "sea,food_wine", provincia: "TP" });
    expect(parseActivityFilters(activityFiltersQuery(filters), allowed)).toEqual(filters);
    expect(activityFiltersQuery({ interests: [], province: null })).toEqual({});
  });
});
