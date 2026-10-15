import { describe, expect, it } from "vitest";
import { dayFromZoneId, dayZoneId, dropOn, locate, placements, stepInDay, type DayOrder } from "./trip-order";

const ORDER: DayOrder = [
  ["a", "b", "c"],
  ["d"],
  [],
];

describe("zone dei giorni", () => {
  it("il codice del giorno torna indietro", () => {
    expect(dayFromZoneId(dayZoneId(2))).toBe(2);
    expect(dayFromZoneId("3f2c9e2a-0000-4000-8000-000000000000")).toBeNull();
    expect(dayFromZoneId("day-x")).toBeNull();
  });
});

describe("placements", () => {
  it("numera ogni giorno da zero", () => {
    expect(placements(ORDER)).toEqual([
      { id: "a", dayIndex: 0, position: 0 },
      { id: "b", dayIndex: 0, position: 1 },
      { id: "c", dayIndex: 0, position: 2 },
      { id: "d", dayIndex: 1, position: 0 },
    ]);
  });
});

describe("locate", () => {
  it("trova giorno e indice, null se manca", () => {
    expect(locate(ORDER, "d")).toEqual({ dayIndex: 1, index: 0 });
    expect(locate(ORDER, "x")).toBeNull();
  });
});

describe("stepInDay", () => {
  it("sposta su e giù nello stesso giorno", () => {
    expect(stepInDay(ORDER, "b", -1)).toEqual([["b", "a", "c"], ["d"], []]);
    expect(stepInDay(ORDER, "b", 1)).toEqual([["a", "c", "b"], ["d"], []]);
  });

  it("non va oltre il primo e l'ultimo del giorno", () => {
    expect(stepInDay(ORDER, "a", -1)).toBeNull();
    expect(stepInDay(ORDER, "c", 1)).toBeNull();
  });
});

describe("dropOn", () => {
  it("riordina dentro il giorno", () => {
    expect(dropOn(ORDER, "a", "c")).toEqual([["b", "c", "a"], ["d"], []]);
  });

  it("su una tappa di un altro giorno la prende il suo posto", () => {
    expect(dropOn(ORDER, "a", "d")).toEqual([["b", "c"], ["a", "d"], []]);
  });

  it("sulla zona di un giorno la mette in fondo", () => {
    expect(dropOn(ORDER, "a", dayZoneId(2))).toEqual([["b", "c"], ["d"], ["a"]]);
    expect(dropOn(ORDER, "c", dayZoneId(0))).toBeNull();
  });

  it("lasciare una tappa dov'è non cambia nulla", () => {
    expect(dropOn(ORDER, "b", "b")).toBeNull();
  });

  it("un id che non esiste non produce un ordine", () => {
    expect(dropOn(ORDER, "x", "a")).toBeNull();
    expect(dropOn(ORDER, "a", "x")).toBeNull();
    expect(dropOn(ORDER, "a", dayZoneId(9))).toBeNull();
  });
});
