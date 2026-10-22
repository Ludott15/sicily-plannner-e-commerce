import { describe, expect, it } from "vitest";
import { legsForPairs, type RouteLeg } from "./legs";

function leg(from: string, to: string): RouteLeg {
  return { fromPlaceId: from, toPlaceId: to, distanceM: 1000, durationS: 120, coordinates: [[12.5, 38], [12.6, 38.1]] };
}

describe("legsForPairs", () => {
  it("restituisce solo le tratte delle coppie richieste, nell'ordine delle coppie", () => {
    const all = [leg("a", "b"), leg("b", "c"), leg("c", "d")];
    const out = legsForPairs(all, [{ from: "c", to: "d" }, { from: "a", to: "b" }]);
    expect(out.map((l) => `${l.fromPlaceId}>${l.toPlaceId}`)).toEqual(["c>d", "a>b"]);
  });

  it("una coppia senza tratta calcolata non compare", () => {
    expect(legsForPairs([leg("a", "b")], [{ from: "b", to: "a" }])).toEqual([]);
  });

  it("non duplica una coppia ripetuta", () => {
    expect(legsForPairs([leg("a", "b")], [{ from: "a", to: "b" }, { from: "a", to: "b" }])).toHaveLength(1);
  });
});
