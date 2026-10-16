import { describe, expect, it } from "vitest";
import { orderPair, pairKey, parsePairKey } from "./drive-pairs";

describe("pairKey", () => {
  it("ordina gli slug: la chiave non dipende dall'ordine degli argomenti", () => {
    expect(pairKey("ovest", "palermo")).toBe("ovest+palermo");
    expect(pairKey("palermo", "ovest")).toBe("ovest+palermo");
  });

  it("parsePairKey restituisce le due aree; una chiave senza + non è una coppia", () => {
    expect(parsePairKey("ovest+palermo")).toEqual(["ovest", "palermo"]);
    expect(parsePairKey("ovest")).toBeNull();
    expect(parsePairKey("a+b+c")).toBeNull();
  });

  it("orderPair ordina gli id come la tabella (area_a_id < area_b_id)", () => {
    expect(orderPair("b", "a")).toEqual(["a", "b"]);
    expect(orderPair("a", "b")).toEqual(["a", "b"]);
  });
});
