import { describe, expect, it } from "vitest";
import { allocateDiscount, allocateProportionally, orderVatBreakdown, vatBreakdown } from "./orders";

const sumNetVat = (buckets: ReturnType<typeof vatBreakdown>) =>
  Object.values(buckets).reduce((sum, bucket) => sum + bucket.netCents + bucket.vatCents, 0);

describe("allocateProportionally (resti più grandi)", () => {
  it("la somma delle quote è sempre il totale", () => {
    const shares = allocateProportionally([1, 1, 1], 100);
    expect(shares).toEqual([34, 33, 33]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("a parità di resto vince la riga più in alto", () => {
    expect(allocateProportionally([1, 1], 1)).toEqual([1, 0]);
  });

  it("pesi nulli non ricevono nulla; senza pesi e con importo positivo: errore", () => {
    expect(allocateProportionally([0, 3], 10)).toEqual([0, 10]);
    expect(() => allocateProportionally([0, 0], 5)).toThrow(RangeError);
    expect(allocateProportionally([0, 0], 0)).toEqual([0, 0]);
  });

  it("invariante su molti casi: somma uguale al totale, nessuna quota negativa", () => {
    for (let total = 0; total <= 300; total += 7) {
      for (const weights of [[1100, 2200], [999, 1, 1], [3, 5, 7, 11], [1, 0, 0, 1]]) {
        const shares = allocateProportionally(weights, total);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
        expect(shares.every((share) => share >= 0)).toBe(true);
      }
    }
  });
});

describe("sconto punti sulle righe", () => {
  it("ripartito in proporzione al valore delle righe", () => {
    expect(allocateDiscount([{ totalCents: 1100, vatRate: 10 }, { totalCents: 1100, vatRate: 10 }], 200)).toEqual([100, 100]);
    expect(allocateDiscount([{ totalCents: 3000, vatRate: 10 }, { totalCents: 1000, vatRate: 22 }], 100)).toEqual([75, 25]);
  });
});

describe("IVA dopo lo sconto", () => {
  it("due righe da 1100 al 10% con sconto 200: imponibile 1818 e IVA 182", () => {
    const buckets = vatBreakdown(
      [
        { totalCents: 1100, vatRate: 10 },
        { totalCents: 1100, vatRate: 10 },
      ],
      200,
    );
    expect(buckets["10"]).toEqual({ netCents: 1818, vatCents: 182 });
    expect(buckets["4"]).toEqual({ netCents: 0, vatCents: 0 });
  });

  it("senza sconto il comportamento è quello di prima", () => {
    expect(vatBreakdown([{ totalCents: 1100, vatRate: 10 }])).toEqual({
      "4": { netCents: 0, vatCents: 0 },
      "10": { netCents: 1000, vatCents: 100 },
      "22": { netCents: 0, vatCents: 0 },
    });
  });
});

describe("spedizione e riconciliazione con il totale incassato", () => {
  it("la spedizione segue le aliquote dei beni: somma di imponibile e IVA = totale incassato", () => {
    const cases = [
      { lines: [{ totalCents: 1100, vatRate: 10 }, { totalCents: 1220, vatRate: 22 }], discountCents: 200, shippingCents: 690 },
      { lines: [{ totalCents: 500, vatRate: 4 }], discountCents: 0, shippingCents: 690 },
      { lines: [{ totalCents: 6000, vatRate: 10 }, { totalCents: 4000, vatRate: 4 }], discountCents: 1500, shippingCents: 0 },
      { lines: [{ totalCents: 999, vatRate: 22 }, { totalCents: 1, vatRate: 4 }], discountCents: 0, shippingCents: 690 },
    ];
    for (const item of cases) {
      const subtotal = item.lines.reduce((sum, line) => sum + line.totalCents, 0);
      const collected = subtotal - item.discountCents + item.shippingCents;
      const buckets = orderVatBreakdown(item);
      expect(sumNetVat(buckets)).toBe(collected);
    }
  });

  it("la quota di spedizione di un'aliquota non supera il totale della spedizione", () => {
    const buckets = orderVatBreakdown({
      lines: [{ totalCents: 3000, vatRate: 10 }, { totalCents: 1000, vatRate: 22 }],
      discountCents: 0,
      shippingCents: 690,
    });
    const shippingGross = Object.values(buckets).reduce((sum, bucket) => sum + bucket.netCents + bucket.vatCents, 0) - 4000;
    expect(shippingGross).toBe(690);
  });
});
