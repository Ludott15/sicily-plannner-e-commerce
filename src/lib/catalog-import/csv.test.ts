import { describe, expect, it } from "vitest";
import { CsvParseError, parseCsv } from "./csv";
import { catalogImportTemplate, CATALOG_IMPORT_COLUMNS } from "./columns";
import { checkHeader, normalizeRow, type InterestOption } from "./rows";

// Vocabolario degli interessi del seed (supabase/migrations/20260927201718_seed_interests.sql).
const SEED_INTERESTS: InterestOption[] = [
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

describe("parseCsv", () => {
  it("legge intestazione e righe con virgolette e \"\" come virgoletta escapata", () => {
    const doc = parseCsv('slug,name_it\r\nx,"Il ""Bagliore"", Noto"\r\n');
    expect(doc.delimiter).toBe(",");
    expect(doc.header).toEqual(["slug", "name_it"]);
    expect(doc.rows).toEqual([{ line: 2, cells: ["x", 'Il "Bagliore", Noto'] }]);
  });

  it("deduce il separatore ; dalla riga di intestazione", () => {
    const doc = parseCsv('slug;name_it\nx;"a;b"\n');
    expect(doc.delimiter).toBe(";");
    expect(doc.header).toEqual(["slug", "name_it"]);
    expect(doc.rows).toEqual([{ line: 2, cells: ["x", "a;b"] }]);
  });

  it("ignora il BOM iniziale", () => {
    const doc = parseCsv("﻿slug,name_it\r\nx,y\r\n");
    expect(doc.header).toEqual(["slug", "name_it"]);
    expect(doc.rows).toEqual([{ line: 2, cells: ["x", "y"] }]);
  });

  it("accetta CRLF e LF allo stesso modo", () => {
    expect(parseCsv("a,b\r\n1,2\r\n").rows).toEqual(parseCsv("a,b\n1,2\n").rows);
  });

  it("gestisce a capo dentro un campo tra virgolette e numera le righe fisiche", () => {
    const doc = parseCsv('a,b\r\n"x\r\ny",2\r\nc,d');
    expect(doc.rows).toEqual([
      { line: 2, cells: ["x\ny", "2"] },
      { line: 4, cells: ["c", "d"] },
    ]);
  });

  it("salta le righe completamente vuote, mantenendo il numero di riga reale", () => {
    const doc = parseCsv("a,b\n\n1,2\n,\n3,4\n");
    expect(doc.rows).toEqual([
      { line: 3, cells: ["1", "2"] },
      { line: 5, cells: ["3", "4"] },
    ]);
  });

  it("file vuoto: intestazione vuota e nessuna riga", () => {
    expect(parseCsv("")).toEqual({ delimiter: ",", header: [], rows: [] });
  });

  it("lancia CsvParseError se una virgoletta non si chiude", () => {
    expect(() => parseCsv('a,b\n1,"non chiuso\n2,3')).toThrow(CsvParseError);
    try {
      parseCsv('a,b\n1,"non chiuso\n2,3');
    } catch (error) {
      expect(error).toBeInstanceOf(CsvParseError);
      expect((error as CsvParseError).line).toBe(2);
    }
  });
});

describe("catalogImportTemplate", () => {
  it("intestazione in prima riga e a capo CRLF finale, senza altre righe oltre agli esempi", () => {
    const template = catalogImportTemplate();
    expect(template.startsWith(`${CATALOG_IMPORT_COLUMNS.join(",")}\r\n`)).toBe(true);
    expect(template.endsWith("\r\n")).toBe(true);
    expect(template.split("\r\n")).toHaveLength(4); // intestazione, due esempi, coda vuota dopo il CRLF finale
  });
});

describe("catalogImportTemplate con due righe di esempio", () => {
  it("ri-parsato dà esattamente due righe valide, dichiarate demo", () => {
    const doc = parseCsv(catalogImportTemplate());
    expect(doc.delimiter).toBe(",");
    expect(doc.rows).toHaveLength(2);

    const header = checkHeader(doc.header);
    expect(header.ok).toBe(true);
    if (!header.ok) return;

    const results = doc.rows.map((row) => normalizeRow(row.line, row.cells, header.index, SEED_INTERESTS));
    results.forEach((result) => {
      expect(result.ok).toBe(true);
    });

    const [first, second] = results;
    if (!first?.ok || !second?.ok) return;

    expect(first.row.slug).toBe("demo-esempio-passeggiata");
    expect(first.row.slug.startsWith("demo-esempio-")).toBe(true);
    expect(first.row.title).toMatch(/esempio/i);
    expect(first.row.place.slug.startsWith("demo-")).toBe(true);
    expect(first.row.onSitePriceEur).toBe("12.50");
    expect(first.row.seasonMonths).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(first.row.dietFriendly).toEqual(["vegetarian", "gluten_free"]);
    expect(first.row.tags).toEqual([
      { key: "sea", strength: 3 },
      { key: "history_archaeology", strength: 2 },
    ]);

    expect(second.row.slug).toBe("demo-esempio-degustazione");
    expect(second.row.title).toMatch(/esempio/i);
    expect(second.row.place.slug.startsWith("demo-")).toBe(true);
    expect(second.row.tags).toEqual([
      { key: "food_wine", strength: 3 },
      { key: "local_experiences", strength: 2 },
    ]);
  });
});
