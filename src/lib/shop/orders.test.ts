import { describe, expect, it } from "vitest";
import {
  expectedPaidCents,
  isOrderNumber,
  orderPageUrl,
  parseShippingAddress,
  pointsEarnedForTotal,
  vatBreakdown,
  vatSplit,
} from "./orders";

describe("numero d'ordine", () => {
  it("accetta solo ISU-AAAA-NNNNNN", () => {
    expect(isOrderNumber("ISU-2026-000001")).toBe(true);
    expect(isOrderNumber("ISU-2026-1")).toBe(false);
    expect(isOrderNumber("isu-2026-000001")).toBe(false);
    expect(isOrderNumber("ISU-2026-000001 ")).toBe(false);
    expect(isOrderNumber("ORD-2026-000001")).toBe(false);
  });
});

describe("punti a consegna", () => {
  it("un punto per euro intero del totale pagato", () => {
    expect(pointsEarnedForTotal(0)).toBe(0);
    expect(pointsEarnedForTotal(99)).toBe(0);
    expect(pointsEarnedForTotal(100)).toBe(1);
    expect(pointsEarnedForTotal(1999)).toBe(19);
    expect(pointsEarnedForTotal(2000)).toBe(20);
  });

  it("rifiuta importi non interi o negativi", () => {
    expect(() => pointsEarnedForTotal(-1)).toThrow(RangeError);
    expect(() => pointsEarnedForTotal(10.5)).toThrow(RangeError);
  });
});

describe("importo atteso da Stripe", () => {
  it("subtotale meno sconto punti più spedizione", () => {
    expect(expectedPaidCents({ subtotalCents: 6000, discountCents: 900, shippingCents: 0 })).toBe(5100);
    expect(expectedPaidCents({ subtotalCents: 2400, discountCents: 0, shippingCents: 690 })).toBe(3090);
  });
});

describe("IVA", () => {
  it("scomposizione: imponibile più IVA è sempre il lordo", () => {
    expect(vatSplit(1100, 10)).toEqual({ netCents: 1000, vatCents: 100 });
    expect(vatSplit(1220, 22)).toEqual({ netCents: 1000, vatCents: 220 });
    for (const rate of [4, 10, 22]) {
      for (const gross of [1, 99, 1234, 98765]) {
        const split = vatSplit(gross, rate);
        expect(split.netCents + split.vatCents).toBe(gross);
      }
    }
  });

  it("somma per aliquota, con le tre aliquote sempre presenti", () => {
    const buckets = vatBreakdown([
      { totalCents: 1100, vatRate: 10 },
      { totalCents: 1100, vatRate: 10 },
      { totalCents: 1220, vatRate: 22 },
    ]);
    expect(buckets["10"]).toEqual({ netCents: 2000, vatCents: 200 });
    expect(buckets["22"]).toEqual({ netCents: 1000, vatCents: 220 });
    expect(buckets["4"]).toEqual({ netCents: 0, vatCents: 0 });
  });

  it("rifiuta un'aliquota non prevista", () => {
    expect(() => vatBreakdown([{ totalCents: 100, vatRate: 5 }])).toThrow(RangeError);
  });
});

describe("link alla pagina dell'ordine", () => {
  it("account: solo il percorso, senza token", () => {
    expect(
      orderPageUrl({ siteUrl: "https://isula.example/", locale: "it", orderNumber: "ISU-2026-000001" }),
    ).toBe("https://isula.example/it/ordini/ISU-2026-000001");
  });

  it("ospite: il token nella query, codificato", () => {
    expect(
      orderPageUrl({
        siteUrl: "https://isula.example",
        locale: "en",
        orderNumber: "ISU-2026-000002",
        accessToken: "abc_DEF-123",
      }),
    ).toBe("https://isula.example/en/ordini/ISU-2026-000002?t=abc_DEF-123");
  });

  it("rifiuta un numero non valido", () => {
    expect(() => orderPageUrl({ siteUrl: "https://x.example", locale: "it", orderNumber: "../x" })).toThrow(
      RangeError,
    );
  });
});

describe("indirizzo dal JSON dell'ordine", () => {
  it("accetta la forma scritta dal webhook", () => {
    const address = {
      name: "Maria",
      phone: "+390000000000",
      line1: "Via Roma 1",
      line2: null,
      postalCode: "90100",
      city: "Palermo",
      province: "PA",
      country: "IT",
    };
    expect(parseShippingAddress(address)).toEqual(address);
  });

  it("una forma diversa dà null", () => {
    expect(parseShippingAddress({ line1: "Via Roma 1" })).toBeNull();
    expect(parseShippingAddress(null)).toBeNull();
    expect(parseShippingAddress("testo")).toBeNull();
  });
});
