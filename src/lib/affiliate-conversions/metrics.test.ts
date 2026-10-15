import { describe, expect, it } from "vitest";
import { conversionRate } from "./metrics";

describe("conversionRate", () => {
  it("conversioni divise per click", () => {
    expect(conversionRate(200, 5)).toBe(0.025);
    expect(conversionRate(4, 4)).toBe(1);
    expect(conversionRate(10, 0)).toBe(0);
  });

  it("senza click non c'è un tasso", () => {
    expect(conversionRate(0, 0)).toBeNull();
    expect(conversionRate(0, 3)).toBeNull();
  });
});
