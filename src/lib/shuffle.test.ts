import { describe, expect, it } from "vitest";
import { shuffle } from "./shuffle";

describe("shuffle", () => {
  const items = [1, 2, 3, 4, 5];

  it("conserva lunghezza ed elementi", () => {
    const result = shuffle(items);
    expect(result).toHaveLength(items.length);
    expect([...result].sort((a, b) => a - b)).toEqual(items);
  });

  it("con un generatore fisso produce un ordine deterministico", () => {
    // random() = 0 sceglie sempre la posizione 0: [1,2,3,4] → [2,3,4,1].
    expect(shuffle([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
    // random() vicino a 1 lascia l'ordine invariato.
    expect(shuffle([1, 2, 3, 4], () => 0.999999)).toEqual([1, 2, 3, 4]);
  });

  it("non modifica l'array in ingresso", () => {
    const input = [1, 2, 3];
    shuffle(input, () => 0);
    expect(input).toEqual([1, 2, 3]);
  });

  it("gestisce liste vuote e con un solo elemento", () => {
    expect(shuffle([], () => 0)).toEqual([]);
    expect(shuffle(["solo"], () => 0)).toEqual(["solo"]);
  });
});
