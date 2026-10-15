import { describe, expect, it } from "vitest";
import { shouldSuggestAlternatives } from "./group-votes";

describe("shouldSuggestAlternatives", () => {
  it("scatta con voti contrari pari alla metà dei membri", () => {
    expect(shouldSuggestAlternatives(2, 4)).toBe(true);
    expect(shouldSuggestAlternatives(1, 1)).toBe(true);
  });

  it("non scatta sotto la metà", () => {
    expect(shouldSuggestAlternatives(1, 4)).toBe(false);
    expect(shouldSuggestAlternatives(0, 3)).toBe(false);
  });

  it("non scatta senza membri", () => {
    expect(shouldSuggestAlternatives(0, 0)).toBe(false);
  });
});
