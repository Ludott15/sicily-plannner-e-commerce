import { describe, expect, it } from "vitest";
import { externalIdFor } from "./external-id";
import {
  checkConversionHeader,
  normalizeConversionRow,
  normalizeStatus,
  parseAmount,
  parseReportedAt,
  type ConversionColumnIndex,
} from "./rows";
import { CONVERSION_COLUMNS, type ConversionColumn } from "./types";

const HEADER = [...CONVERSION_COLUMNS];

function indexOf(header: string[]): ConversionColumnIndex {
  const result = checkConversionHeader(header);
  if (!result.ok) throw new Error("intestazione di prova non valida");
  return result.index;
}

const index = indexOf(HEADER);

const VALID = {
  partner: "getyourguide",
  subid: "abcdef0123456789",
  external_id: "ext-1",
  amount_eur: "120,50",
  commission_eur: "9.60",
  status: "approvata",
  reported_at: "2026-10-01",
};

function cellsFrom(values: Partial<Record<ConversionColumn, string>>): string[] {
  return CONVERSION_COLUMNS.map((column) => values[column] ?? "");
}

describe("intestazione", () => {
  it("accetta le colonne in qualunque ordine e con maiuscole o spazi", () => {
    const reversed = [...HEADER].reverse().map((name) => ` ${name.toUpperCase()} `);
    expect(checkConversionHeader(reversed).ok).toBe(true);
  });

  it("segnala le colonne obbligatorie mancanti e quelle sconosciute", () => {
    const result = checkConversionHeader(["partner", "subid", "importo", "stato"]);
    expect(result).toEqual({
      ok: false,
      missing: ["amount_eur", "commission_eur", "status", "reported_at"],
      unknown: ["importo", "stato"],
    });
  });

  it("external_id è facoltativo", () => {
    const withoutExternal = HEADER.filter((name) => name !== "external_id");
    expect(checkConversionHeader(withoutExternal).ok).toBe(true);
  });
});

describe("stato", () => {
  it("accetta inglese e italiano, senza distinguere maiuscole e spazi", () => {
    expect(normalizeStatus("Approved")).toBe("approved");
    expect(normalizeStatus(" in attesa ")).toBe("pending");
    expect(normalizeStatus("annullata")).toBe("cancelled");
    expect(normalizeStatus("canceled")).toBe("cancelled");
    expect(normalizeStatus("pagata")).toBe("paid");
  });

  it("rifiuta valori sconosciuti", () => {
    expect(normalizeStatus("rimborsata")).toBeNull();
    expect(normalizeStatus("")).toBeNull();
  });
});

describe("importi e date", () => {
  it("importi con punto o virgola, due decimali, mai negativi", () => {
    expect(parseAmount("120,5")).toBe("120.50");
    expect(parseAmount("9.6")).toBe("9.60");
    expect(parseAmount("0")).toBe("0.00");
    expect(parseAmount("-1")).toBeNull();
    expect(parseAmount("1,234")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("123456789")).toBeNull();
  });

  it("date YYYY-MM-DD di un calendario valido", () => {
    expect(parseReportedAt("2026-10-01")).toBe("2026-10-01");
    expect(parseReportedAt("2026-02-30")).toBeNull();
    expect(parseReportedAt("01/10/2026")).toBeNull();
  });
});

describe("normalizeConversionRow", () => {
  it("una riga valida diventa una conversione normalizzata con external_id calcolato", () => {
    const result = normalizeConversionRow(3, cellsFrom(VALID), index);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.line).toBe(3);
    expect(result.row).toEqual({
      partner: "getyourguide",
      subid: "abcdef0123456789",
      externalId: "ext-1",
      amountEur: "120.50",
      commissionEur: "9.60",
      status: "approved",
      reportedAt: "2026-10-01",
    });
  });

  it("senza external_id lo calcola dal server con sha256 di partner, subid, data e importo", () => {
    const result = normalizeConversionRow(2, cellsFrom({ ...VALID, external_id: "" }), index);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.externalId).toBe(
      externalIdFor({ partner: "getyourguide", subid: "abcdef0123456789", reportedAt: "2026-10-01", amountEur: "120.50" }),
    );
    expect(result.row.externalId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("normalizza il subid in minuscolo e il partner senza spazi", () => {
    const result = normalizeConversionRow(2, cellsFrom({ ...VALID, partner: " Viator ", subid: "ABCDEF0123456789" }), index);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.partner).toBe("viator");
    expect(result.row.subid).toBe("abcdef0123456789");
  });

  it("restituisce tutti gli errori della riga, non solo il primo", () => {
    const result = normalizeConversionRow(
      7,
      cellsFrom({ partner: "internal", subid: "corto", amount_eur: "-3", commission_eur: "1", status: "boh", reported_at: "2026-13-01" }),
      index,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.line).toBe(7);
    expect(result.errors.map((e) => e.code)).toEqual([
      "partner_invalid",
      "subid_invalid",
      "amount_invalid",
      "status_invalid",
      "reported_at_invalid",
    ]);
  });

  it("scarta un external_id più lungo di 120 caratteri", () => {
    const result = normalizeConversionRow(2, cellsFrom({ ...VALID, external_id: "x".repeat(121) }), index);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.code)).toEqual(["external_id_invalid"]);
  });
});
