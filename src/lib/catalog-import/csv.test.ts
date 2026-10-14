import { describe, expect, it } from "vitest";
import { CsvParseError, parseCsv } from "./csv";
import { catalogImportTemplate, CATALOG_IMPORT_COLUMNS } from "./columns";

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
  it("contiene solo l'intestazione con CRLF finale", () => {
    const template = catalogImportTemplate();
    expect(template).toBe(`${CATALOG_IMPORT_COLUMNS.join(",")}\r\n`);
    expect(parseCsv(template).rows).toEqual([]);
  });
});
