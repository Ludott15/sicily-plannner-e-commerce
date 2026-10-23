import { describe, expect, it } from "vitest";
import { cartTotals, pointsDiscount } from "./checkout-math";
import { FREE_SHIPPING_THRESHOLD_CENTS, SHIPPING_FLAT_CENTS } from "./config";

describe("cartTotals", () => {
  it("sotto la soglia paga la tariffa fissa e dice quanto manca alla spedizione gratuita", () => {
    const totals = cartTotals([{ lineTotalCents: 2000, isPerishable: false, leadTimeDays: 3 }]);
    expect(totals.subtotalCents).toBe(2000);
    expect(totals.shippingCents).toBe(SHIPPING_FLAT_CENTS);
    expect(totals.totalCents).toBe(2000 + SHIPPING_FLAT_CENTS);
    expect(totals.freeShippingRemainingCents).toBe(FREE_SHIPPING_THRESHOLD_CENTS - 2000);
  });

  it("alla soglia esatta la spedizione è gratuita (5900 centesimi)", () => {
    const totals = cartTotals([{ lineTotalCents: FREE_SHIPPING_THRESHOLD_CENTS, isPerishable: false, leadTimeDays: 3 }]);
    expect(totals.shippingCents).toBe(0);
    expect(totals.totalCents).toBe(FREE_SHIPPING_THRESHOLD_CENTS);
    expect(totals.freeShippingRemainingCents).toBe(0);
  });

  it("un centesimo sotto la soglia la spedizione si paga", () => {
    const totals = cartTotals([{ lineTotalCents: FREE_SHIPPING_THRESHOLD_CENTS - 1, isPerishable: false, leadTimeDays: 3 }]);
    expect(totals.shippingCents).toBe(SHIPPING_FLAT_CENTS);
    expect(totals.freeShippingRemainingCents).toBe(1);
  });

  it("segnala i deperibili e prende il tempo di evasione più lungo", () => {
    const totals = cartTotals([
      { lineTotalCents: 1000, isPerishable: false, leadTimeDays: 2 },
      { lineTotalCents: 1000, isPerishable: true, leadTimeDays: 5 },
    ]);
    expect(totals.hasPerishable).toBe(true);
    expect(totals.maxLeadTimeDays).toBe(5);
  });

  it("carrello vuoto: nessun subtotale e nessuna spedizione", () => {
    const totals = cartTotals([]);
    expect(totals.subtotalCents).toBe(0);
    expect(totals.shippingCents).toBe(0);
    expect(totals.totalCents).toBe(0);
    expect(totals.hasPerishable).toBe(false);
    expect(totals.maxLeadTimeDays).toBe(0);
  });
});

describe("pointsDiscount", () => {
  it("100 punti valgono 1 euro: il saldo limita lo sconto", () => {
    expect(pointsDiscount({ balancePoints: 250, subtotalCents: 6000 })).toEqual({ points: 200, discountCents: 200 });
  });

  it("il tetto è il 15% del subtotale, arrotondato all'euro inferiore", () => {
    // 15% di 60,00 euro = 9,00 euro: con un saldo più alto lo sconto si ferma lì.
    expect(pointsDiscount({ balancePoints: 10000, subtotalCents: 6000 })).toEqual({ points: 900, discountCents: 900 });
    // 15% di 66,66 euro = 9,9990 euro: si arrotonda a 9 euro, non a 10.
    expect(pointsDiscount({ balancePoints: 10000, subtotalCents: 6666 })).toEqual({ points: 900, discountCents: 900 });
  });

  it("saldo sotto un euro, o subtotale troppo basso: nessuno sconto", () => {
    expect(pointsDiscount({ balancePoints: 99, subtotalCents: 6000 })).toEqual({ points: 0, discountCents: 0 });
    expect(pointsDiscount({ balancePoints: 10000, subtotalCents: 666 })).toEqual({ points: 0, discountCents: 0 });
    expect(pointsDiscount({ balancePoints: 0, subtotalCents: 6000 })).toEqual({ points: 0, discountCents: 0 });
  });

  it("rifiuta importi non interi o negativi", () => {
    expect(() => pointsDiscount({ balancePoints: -1, subtotalCents: 6000 })).toThrow(RangeError);
    expect(() => pointsDiscount({ balancePoints: 100, subtotalCents: 60.5 })).toThrow(RangeError);
  });
});
