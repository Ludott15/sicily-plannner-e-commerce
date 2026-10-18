import { describe, expect, it } from "vitest";
import { tripDayIndex } from "./trip-today";

describe("tripDayIndex", () => {
  const start = "2026-06-10";
  const days = 3; // 10, 11, 12 giugno

  it("non c'è giorno senza data di partenza", () => {
    expect(tripDayIndex(null, days, "2026-06-11")).toBeNull();
  });

  it("prima della partenza non c'è giorno", () => {
    expect(tripDayIndex(start, days, "2026-06-09")).toBeNull();
  });

  it("il primo giorno è l'indice 0", () => {
    expect(tripDayIndex(start, days, "2026-06-10")).toBe(0);
  });

  it("durante il viaggio è l'indice del giorno", () => {
    expect(tripDayIndex(start, days, "2026-06-11")).toBe(1);
  });

  it("l'ultimo giorno è incluso", () => {
    expect(tripDayIndex(start, days, "2026-06-12")).toBe(2);
  });

  it("dopo l'ultimo giorno non c'è giorno", () => {
    expect(tripDayIndex(start, days, "2026-06-13")).toBeNull();
  });

  it("attraversa fine mese e anno", () => {
    expect(tripDayIndex("2026-12-30", 4, "2027-01-01")).toBe(2);
    expect(tripDayIndex("2026-02-27", 3, "2026-03-01")).toBe(2);
  });

  it("un viaggio di un solo giorno vale solo quel giorno", () => {
    expect(tripDayIndex("2026-06-10", 1, "2026-06-10")).toBe(0);
    expect(tripDayIndex("2026-06-10", 1, "2026-06-11")).toBeNull();
  });

  it("date non valide o senza giorni non danno un indice", () => {
    expect(tripDayIndex("2026-02-30", 2, "2026-02-30")).toBeNull();
    expect(tripDayIndex(start, 0, start)).toBeNull();
    expect(tripDayIndex(start, days, "non-una-data")).toBeNull();
  });
});
