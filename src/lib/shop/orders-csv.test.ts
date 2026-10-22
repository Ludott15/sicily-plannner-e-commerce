import { describe, expect, it } from "vitest";
import { centsToDecimal, ordersCsv, ORDERS_CSV_COLUMNS, type OrdersCsvRow } from "./orders-csv";

const emptyVat = {
  "4": { netCents: 0, vatCents: 0 },
  "10": { netCents: 0, vatCents: 0 },
  "22": { netCents: 0, vatCents: 0 },
};

const row: OrdersCsvRow = {
  date: "2026-10-21",
  orderNumber: "ISU-2026-000001",
  status: "paid",
  vat: { ...emptyVat, "10": { netCents: 1000, vatCents: 100 } },
  shippingCents: 690,
  discountCents: 0,
  totalCents: 1790,
  costCents: 500,
  needsReview: false,
};

describe("centsToDecimal", () => {
  it("due decimali con il punto", () => {
    expect(centsToDecimal(1250)).toBe("12.50");
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(0)).toBe("0.00");
    expect(centsToDecimal(-300)).toBe("-3.00");
    expect(centsToDecimal(123456)).toBe("1234.56");
  });

  it("rifiuta importi non interi", () => {
    expect(() => centsToDecimal(1.5)).toThrow(RangeError);
  });
});

describe("ordersCsv", () => {
  it("intestazione con le colonne del commercialista, poi una riga per ordine", () => {
    const csv = ordersCsv([row]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(ORDERS_CSV_COLUMNS.map((name) => `"${name}"`).join(","));
    expect(lines[1]).toBe(
      [
        '"2026-10-21"',
        '"ISU-2026-000001"',
        '"paid"',
        '"0.00"',
        '"0.00"',
        '"10.00"',
        '"1.00"',
        '"0.00"',
        '"0.00"',
        '"6.90"',
        '"0.00"',
        '"17.90"',
        '"5.00"',
        '"no"',
      ].join(","),
    );
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("costo mancante: cella vuota, senza virgolette", () => {
    const [, line] = ordersCsv([{ ...row, costCents: null }]).split("\r\n");
    expect(line).toContain(",,");
  });

  it("le virgolette nei valori si raddoppiano", () => {
    const [, line] = ordersCsv([{ ...row, status: 'pa"id' }]).split("\r\n");
    expect(line).toContain('"pa""id"');
  });

  it("nessun ordine: solo l'intestazione", () => {
    expect(ordersCsv([]).split("\r\n").filter(Boolean)).toHaveLength(1);
  });
});
