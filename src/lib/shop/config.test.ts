import { describe, expect, it } from "vitest";
import {
  FREE_SHIPPING_THRESHOLD_CENTS,
  SHIPPING_FLAT_CENTS,
  isShippingCountry,
  isVatRate,
  shippingCentsFor,
} from "./config";

describe("shippingCentsFor", () => {
  it("applica la tariffa fissa sotto la soglia", () => {
    expect(shippingCentsFor(0)).toBe(SHIPPING_FLAT_CENTS);
    expect(shippingCentsFor(FREE_SHIPPING_THRESHOLD_CENTS - 1)).toBe(SHIPPING_FLAT_CENTS);
  });

  it("è gratuita dalla soglia in su", () => {
    expect(shippingCentsFor(FREE_SHIPPING_THRESHOLD_CENTS)).toBe(0);
    expect(shippingCentsFor(FREE_SHIPPING_THRESHOLD_CENTS + 1)).toBe(0);
  });

  it.each([-1, 1.5, Number.NaN])("rifiuta il subtotale %s", (value) => {
    expect(() => shippingCentsFor(value)).toThrow(RangeError);
  });
});

describe("isShippingCountry", () => {
  it("accetta solo l'Italia nella prima versione", () => {
    expect(isShippingCountry("IT")).toBe(true);
    expect(isShippingCountry("FR")).toBe(false);
    expect(isShippingCountry("it")).toBe(false);
  });
});

describe("isVatRate", () => {
  it.each([[4, true], [10, true], [22, true], [5, false], [0, false]])("%i -> %s", (rate, expected) => {
    expect(isVatRate(rate)).toBe(expected);
  });
});
