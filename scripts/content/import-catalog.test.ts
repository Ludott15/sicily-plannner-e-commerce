import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCatalog, readCatalogFiles, todayInRome } from "./import-catalog.mjs";

const CATALOG = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "content", "catalog");

const valid = () => {
  const files = readCatalogFiles(CATALOG);
  return structuredClone(files);
};

describe("parseCatalog", () => {
  it("accetta il catalogo del repo con tutti i luoghi, le attività e gli itinerari", () => {
    const catalog = parseCatalog(readCatalogFiles(CATALOG));
    expect(catalog.places).toHaveLength(38);
    expect(catalog.activities).toHaveLength(66);
    expect(catalog.itineraries).toHaveLength(6);
  });

  it("rifiuta uno slug non valido e uno ripetuto", () => {
    const bad = valid();
    bad.luoghi[0].slug = "Palermo_2";
    expect(() => parseCatalog(bad)).toThrow("slug non valido");
    const dup = valid();
    dup.luoghi[1].slug = dup.luoghi[0].slug;
    expect(() => parseCatalog(dup)).toThrow("slug ripetuto");
  });

  it("rifiuta una descrizione di luogo fuori dai limiti", () => {
    const short = valid();
    short.luoghi[0].description_it = "Troppo corta.";
    expect(() => parseCatalog(short)).toThrow("description_it");
  });

  it("richiede esattamente due consigli per attività", () => {
    const one = valid();
    one.attivita[0].consigli = [one.attivita[0].consigli[0]];
    expect(() => parseCatalog(one)).toThrow("deve avere 2 voci");
  });

  it("richiede almeno una voce per giorno e rispetta le lunghezze massime", () => {
    const longIntro = valid();
    longIntro.itinerari[0].day_intros[0] = "x".repeat(241);
    expect(() => parseCatalog(longIntro)).toThrow("supera 240");
    const emptyDays = valid();
    emptyDays.itinerari[0].day_intros = [];
    expect(() => parseCatalog(emptyDays)).toThrow("una voce per giorno");
  });

  it("accetta solo fonti https", () => {
    const http = valid();
    http.attivita[0].fonti = ["http://example.org/x"];
    expect(() => parseCatalog(http)).toThrow("fonte non valida");
  });
});

describe("todayInRome", () => {
  it("restituisce la data nel formato AAAA-MM-GG", () => {
    expect(todayInRome(new Date("2026-10-20T23:30:00Z"))).toBe("2026-10-21");
    expect(todayInRome(new Date("2026-10-20T10:00:00Z"))).toBe("2026-10-20");
  });
});
