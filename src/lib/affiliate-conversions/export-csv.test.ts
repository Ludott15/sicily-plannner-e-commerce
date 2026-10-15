import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/catalog-import/csv";
import { checkConversionHeader, normalizeConversionRow } from "./rows";
import { conversionsCsv, csvField, type ConversionExportRow } from "./export-csv";
import { conversionImportTemplate } from "./template";

const ROW: ConversionExportRow = {
  reportedAt: "2026-10-01",
  partner: "getyourguide",
  subid: "abcdef0123456789",
  context: "itinerary",
  activityTitle: "Tour; \"notturno\"",
  amountEur: "120.00",
  commissionEur: "9.60",
  status: "approved",
};

describe("csvField", () => {
  it("quota i campi con ; virgolette o a capo e raddoppia le virgolette", () => {
    expect(csvField("a;b")).toBe('"a;b"');
    expect(csvField('dice "ciao"')).toBe('"dice ""ciao"""');
    expect(csvField("riga\nnuova")).toBe('"riga\nnuova"');
    expect(csvField("semplice")).toBe("semplice");
  });

  it("neutralizza le formule di foglio di calcolo", () => {
    expect(csvField("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("@sum")).toBe("'@sum");
  });
});

describe("conversionsCsv", () => {
  it("ha BOM, intestazione con ; e importi con la virgola", () => {
    const text = conversionsCsv([ROW]);
    expect(text.startsWith("﻿data;partner;subid;contesto;attività;importo_eur;commissione_eur;stato\r\n")).toBe(true);
    expect(text).toContain("2026-10-01;getyourguide;abcdef0123456789;itinerary;\"Tour; \"\"notturno\"\"\";120,00;9,60;approved");
  });

  it("i campi vuoti restano vuoti", () => {
    const text = conversionsCsv([{ ...ROW, context: null, activityTitle: null, amountEur: null, commissionEur: null }]);
    expect(text).toContain("2026-10-01;getyourguide;abcdef0123456789;;;;;approved");
  });

  it("il separatore è ; e il file ha il BOM, come lo vuole Excel in italiano", () => {
    const text = conversionsCsv([]);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.split("\r\n")[0]).toBe("﻿data;partner;subid;contesto;attività;importo_eur;commissione_eur;stato");
  });
});

describe("conversionImportTemplate", () => {
  it("l'intestazione è il modello e le righe di prova si importano", () => {
    const doc = parseCsv(conversionImportTemplate());
    expect(doc.delimiter).toBe(";");
    const index = checkConversionHeader(doc.header);
    expect(index.ok).toBe(true);
    if (!index.ok) return;
    for (const row of doc.rows) {
      expect(normalizeConversionRow(row.line, row.cells, index.index).ok).toBe(true);
    }
  });
});
