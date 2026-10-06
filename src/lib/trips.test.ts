import { describe, expect, it } from "vitest";
import { bookingEntries, moveInDay, suggestDay } from "./trips";

describe("suggestDay", () => {
  it("propone il primo giorno con tappe nella stessa area", () => {
    expect(suggestDay([["ovest"], ["palermo"], ["palermo"]], [2, 1, 1], "palermo")).toEqual({ day: 1, far: false });
  });

  it("area diversa da tutte: il primo giorno vuoto, con l'avviso del viaggio lontano", () => {
    expect(suggestDay([["ovest"], [], []], [2, 0, 0], "siracusano")).toEqual({ day: 1, far: true });
  });

  it("nessun giorno vuoto: il giorno con meno tappe, con l'avviso", () => {
    expect(suggestDay([["ovest"], ["ovest"]], [3, 1], "siracusano")).toEqual({ day: 1, far: true });
  });

  it("viaggio vuoto o attività senza area: nessun avviso", () => {
    expect(suggestDay([[], [], []], [0, 0, 0], "siracusano")).toEqual({ day: 0, far: false });
    expect(suggestDay([["ovest"], []], [1, 0], null)).toEqual({ day: 1, far: false });
  });
});

describe("bookingEntries", () => {
  const stops = [
    { activityId: "a1", title: "Zingaro", requiresCar: true },
    { activityId: "a2", title: "Saline", requiresCar: false },
    { activityId: null, title: "Arrivo", requiresCar: false },
    { activityId: "a1", title: "Zingaro", requiresCar: true },
  ];
  const offers = [{ activityId: "a1", partner: "getyourguide" }];

  it("alloggio e voli sempre, auto se serve, attività solo con un'offerta, senza doppioni", () => {
    const entries = bookingEntries(stops, offers, []);
    expect(entries.map((e) => e.key)).toEqual(["lodging", "car", "activity:a1", "flight"]);
    expect(entries.find((e) => e.kind === "activity")).toMatchObject({ title: "Zingaro", partner: "getyourguide", done: false });
    expect(bookingEntries(stops.filter((s) => !s.requiresCar), offers, []).map((e) => e.key)).toEqual(["lodging", "flight"]);
  });

  it("lo stato viene dalle righe salvate", () => {
    const entries = bookingEntries(stops, offers, [
      { kind: "lodging", activityId: null, status: "booked" },
      { kind: "activity", activityId: "a1", status: "to_book" },
    ]);
    expect(entries.filter((e) => e.done).map((e) => e.key)).toEqual(["lodging"]);
  });
});

describe("moveInDay", () => {
  it("su e giù scambiano con la tappa vicina; ai bordi non cambia nulla", () => {
    expect(moveInDay(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveInDay(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(moveInDay(["a", "b", "c"], "a", "up")).toEqual(["a", "b", "c"]);
    expect(moveInDay(["a", "b", "c"], "c", "down")).toEqual(["a", "b", "c"]);
    expect(moveInDay(["a"], "x", "up")).toEqual(["a"]);
  });
});
