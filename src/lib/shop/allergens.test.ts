import { describe, expect, it } from "vitest";
import { ALLERGENS, isAllergen, parseAllergens } from "./allergens";

describe("elenco allergeni", () => {
  it("contiene i 14 allergeni del Reg. UE 1169/2011 senza duplicati", () => {
    expect(ALLERGENS).toHaveLength(14);
    expect(new Set(ALLERGENS).size).toBe(14);
  });
});

describe("parseAllergens", () => {
  it("normalizza spazi e maiuscole, toglie i duplicati e ordina come l'elenco ufficiale", () => {
    expect(parseAllergens([" Milk ", "gluten", "milk", ""])).toEqual({ ok: true, keys: ["gluten", "milk"] });
  });

  it("restituisce i valori sconosciuti", () => {
    expect(parseAllergens(["gluten", "latte", " uova "])).toEqual({ ok: false, unknown: ["latte", "uova"] });
  });

  it("accetta un elenco vuoto", () => {
    expect(parseAllergens([])).toEqual({ ok: true, keys: [] });
  });
});

describe("isAllergen", () => {
  it("riconosce solo le chiavi ufficiali", () => {
    expect(isAllergen("sulphites")).toBe(true);
    expect(isAllergen("sulfites")).toBe(false);
  });
});
