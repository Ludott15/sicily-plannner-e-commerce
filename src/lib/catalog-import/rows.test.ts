import { describe, expect, it } from "vitest";
import { CATALOG_IMPORT_COLUMNS, type CatalogImportColumn } from "./columns";
import { checkHeader, normalizeRow, type ColumnIndex, type InterestOption } from "./rows";
import type { ImportIssueCode } from "./types";

const INTERESTS: InterestOption[] = [
  { key: "sea", labelIt: "Mare" },
  { key: "food_wine", labelIt: "Cibo e vino" },
  { key: "history_archaeology", labelIt: "Storia e archeologia" },
  { key: "nature_hiking", labelIt: "Natura ed escursioni" },
  { key: "villages", labelIt: "Borghi" },
  { key: "art", labelIt: "Arte" },
  { key: "nightlife", labelIt: "Vita notturna" },
  { key: "local_experiences", labelIt: "Esperienze locali" },
  { key: "relax", labelIt: "Relax" },
];

function fullIndex(): ColumnIndex {
  const result = checkHeader([...CATALOG_IMPORT_COLUMNS]);
  if (!result.ok) throw new Error("intestazione di test non valida");
  return result.index;
}

const INDEX = fullIndex();

const VALID: Partial<Record<CatalogImportColumn, string>> = {
  slug: "ortigia-passeggiata",
  name_it: "Passeggiata a Ortigia",
  place_slug: "ortigia",
  duration_min: "90",
};

function cellsFor(values: Partial<Record<CatalogImportColumn, string>>): string[] {
  return CATALOG_IMPORT_COLUMNS.map((column) => values[column] ?? "");
}

function run(values: Partial<Record<CatalogImportColumn, string>>) {
  return normalizeRow(7, cellsFor({ ...VALID, ...values }), INDEX, INTERESTS);
}

function codesOf(values: Partial<Record<CatalogImportColumn, string>>): ImportIssueCode[] {
  const result = run(values);
  return result.ok ? [] : result.errors.map((issue) => issue.code);
}

describe("checkHeader", () => {
  it("accetta tutte le colonne in qualsiasi ordine, senza distinzione di maiuscole e spazi", () => {
    const shuffled = [...CATALOG_IMPORT_COLUMNS].reverse().map((name, i) => (i === 0 ? ` ${name.toUpperCase()} ` : name));
    const result = checkHeader(shuffled);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.index.slug).toBe(CATALOG_IMPORT_COLUMNS.length - 1);
  });

  it("segnala le colonne obbligatorie mancanti", () => {
    const result = checkHeader(CATALOG_IMPORT_COLUMNS.filter((c) => c !== "slug" && c !== "duration_min"));
    expect(result).toEqual({ ok: false, missing: ["slug", "duration_min"], unknown: [] });
  });

  it("segnala le colonne sconosciute", () => {
    const result = checkHeader([...CATALOG_IMPORT_COLUMNS, "colore"]);
    expect(result).toEqual({ ok: false, missing: [], unknown: ["colore"] });
  });
});

describe("normalizeRow", () => {
  it("riga valida completa", () => {
    const result = normalizeRow(
      12,
      cellsFor({
        ...VALID,
        name_en: "Ortigia walk",
        area_slug: "siracusa",
        place_name: "Ortigia",
        place_province: "sr",
        place_lat: "37,0647",
        place_lng: "15.2934",
        place_tagline_it: "Il cuore antico di Siracusa",
        description_it: "Un giro a piedi.",
        on_site_price_eur: "12,5",
        requires_car: "no",
        accessible: "sì",
        season_months: "4;5;6",
        diets_suitable: "vegan|gluten_free",
        interests: "mare:3;storia:2",
        image_file: "ortigia.jpg",
        source_url: "https://example.it/ortigia",
        notes: "Verificare orari",
      }),
      INDEX,
      INTERESTS,
    );
    expect(result).toEqual({
      ok: true,
      row: {
        line: 12,
        slug: "ortigia-passeggiata",
        title: "Passeggiata a Ortigia",
        titleEn: "Ortigia walk",
        description: "Un giro a piedi.",
        durationMin: 90,
        onSitePriceEur: "12.50",
        requiresCar: false,
        accessible: true,
        seasonMonths: [4, 5, 6],
        dietFriendly: ["vegan", "gluten_free"],
        tags: [
          { key: "sea", strength: 3 },
          { key: "history_archaeology", strength: 2 },
        ],
        imageFile: "ortigia.jpg",
        sourceUrl: "https://example.it/ortigia",
        notes: "Verificare orari",
        place: {
          slug: "ortigia",
          name: "Ortigia",
          province: "SR",
          lat: 37.0647,
          lng: 15.2934,
          areaSlug: "siracusa",
          taglineIt: "Il cuore antico di Siracusa",
        },
      },
    });
  });

  it("risolve gli interessi per chiave, etichetta intera e prima parola unica", () => {
    const result = run({ interests: "SEA:1; Cibo e vino:2; natura:3" });
    expect(result.ok && result.row.tags).toEqual([
      { key: "sea", strength: 1 },
      { key: "food_wine", strength: 2 },
      { key: "nature_hiking", strength: 3 },
    ]);
  });

  it("interesse con forza fuori range 1..3 è un errore", () => {
    expect(codesOf({ interests: "mare:4" })).toEqual(["interests_invalid"]);
    expect(codesOf({ interests: "mare:0" })).toEqual(["interests_invalid"]);
    expect(codesOf({ interests: "mare" })).toEqual(["interests_invalid"]);
  });

  it("interesse sconosciuto riporta la chiave come valore", () => {
    const result = run({ interests: "xyz:2" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual([{ code: "interest_unknown", column: "interests", value: "xyz" }]);
  });

  it("durata e mese fuori range", () => {
    expect(codesOf({ duration_min: "0" })).toEqual(["duration_invalid"]);
    expect(codesOf({ duration_min: "1441" })).toEqual(["duration_invalid"]);
    expect(codesOf({ season_months: "4;13" })).toEqual(["season_invalid"]);
  });

  it("mesi: vuoto vale tutti i 12 mesi, duplicati e ordine sistemati", () => {
    const empty = run({ season_months: "" });
    expect(empty.ok && empty.row.seasonMonths).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const unordered = run({ season_months: "6;4;4" });
    expect(unordered.ok && unordered.row.seasonMonths).toEqual([4, 6]);
  });

  it("dieta sconosciuta", () => {
    expect(codesOf({ diets_suitable: "keto" })).toEqual(["diet_invalid"]);
  });

  it("booleani: sì/no/vuoto validi, altro no", () => {
    const yes = run({ requires_car: "Yes", accessible: "1" });
    expect(yes.ok && [yes.row.requiresCar, yes.row.accessible]).toEqual([true, true]);
    const empty = run({ requires_car: "", accessible: "no" });
    expect(empty.ok && [empty.row.requiresCar, empty.row.accessible]).toEqual([false, false]);
    expect(codesOf({ accessible: "forse" })).toEqual(["boolean_invalid"]);
  });

  it("decimali con virgola o punto; prezzo negativo non valido", () => {
    const comma = run({ on_site_price_eur: "3,5", place_lat: "-36,9", place_lng: "14,2" });
    expect(comma.ok && comma.row.onSitePriceEur).toBe("3.50");
    expect(comma.ok && [comma.row.place.lat, comma.row.place.lng]).toEqual([-36.9, 14.2]);
    expect(codesOf({ on_site_price_eur: "-1" })).toEqual(["price_invalid"]);
  });

  it("coordinate fuori range", () => {
    expect(codesOf({ place_lat: "95", place_slug: "ortigia" })).toEqual(["coordinates_invalid"]);
    expect(codesOf({ place_lng: "-181" })).toEqual(["coordinates_invalid"]);
  });

  it("provincia non valida", () => {
    expect(codesOf({ place_province: "ZZ" })).toEqual(["province_invalid"]);
  });

  it("tagline oltre 90 caratteri", () => {
    expect(codesOf({ place_tagline_it: "x".repeat(91) })).toEqual(["tagline_too_long"]);
    expect(codesOf({ place_tagline_it: "x".repeat(90) })).toEqual([]);
  });

  it("URL di fonte solo http(s)", () => {
    expect(codesOf({ source_url: "javascript:alert(1)" })).toEqual(["source_url_invalid"]);
    expect(codesOf({ source_url: "ftp://example.it/x" })).toEqual(["source_url_invalid"]);
  });

  it("titolo mancante e troppo lungo", () => {
    expect(codesOf({ name_it: "" })).toEqual(["name_missing"]);
    expect(codesOf({ name_it: "x".repeat(201) })).toEqual(["name_too_long"]);
  });

  it("note oltre 2000 caratteri", () => {
    expect(codesOf({ notes: "n".repeat(2001) })).toEqual(["notes_too_long"]);
  });

  it("slug e slug del luogo con formato non valido", () => {
    expect(codesOf({ slug: "Ortigia Passeggiata" })).toEqual(["slug_invalid"]);
    expect(codesOf({ place_slug: "" })).toEqual(["place_slug_invalid"]);
  });

  it("dieta sconosciuta, mese 13 e forza sbagliata: tutti gli errori insieme", () => {
    expect(
      codesOf({
        slug: "A",
        duration_min: "0",
        place_province: "ZZ",
        season_months: "13",
        interests: "mare:9",
      }),
    ).toEqual(["slug_invalid", "province_invalid", "duration_invalid", "season_invalid", "interests_invalid"]);
  });

  it("errore di riga: restituisce slug e titolo grezzi e il numero di riga è quello passato", () => {
    const result = normalizeRow(9, cellsFor({ slug: "Ko", name_it: "Titolo" }), INDEX, INTERESTS);
    expect(result).toMatchObject({ ok: false, slug: "Ko", title: "Titolo" });
  });
});
