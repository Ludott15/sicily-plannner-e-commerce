import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  clampIsoDate,
  daysInMonth,
  isDateDisabled,
  isValidIsoDate,
  monthGrid,
  monthKey,
  parseIsoDate,
  todayIso,
} from "./calendar";

describe("parseIsoDate e isValidIsoDate", () => {
  it("accetta solo date ISO reali", () => {
    expect(parseIsoDate("2026-10-24")).toEqual({ year: 2026, month: 10, day: 24 });
    expect(parseIsoDate("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
    expect(isValidIsoDate("2027-02-29")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("24/10/2026")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
    expect(parseIsoDate(null)).toBeNull();
  });
});

describe("daysInMonth", () => {
  it("gestisce febbraio e gli anni bisestili", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2026, 10)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });
});

describe("monthGrid", () => {
  it("inizia di lunedì e riempie le celle fuori dal mese con celle vuote", () => {
    // 1 ottobre 2026 è giovedì: prima riga lunedì-mercoledì vuoti, poi il giovedì 1.
    const first = monthGrid(2026, 10)[0] ?? [];
    expect(first.slice(0, 3).every((cell) => !cell.inMonth)).toBe(true);
    expect(first[3]).toEqual({ iso: "2026-10-01", day: 1, inMonth: true });
    expect(first[6]).toEqual({ iso: "2026-10-04", day: 4, inMonth: true });
  });

  it("chiude l'ultima riga con domenica e ha sempre sette celle per riga", () => {
    const grid = monthGrid(2026, 10);
    expect(grid.every((row) => row.length === 7)).toBe(true);
    // 31 ottobre 2026 è sabato: l'ultima riga chiude con domenica 1 novembre, fuori dal mese.
    const last = grid[grid.length - 1] ?? [];
    expect(last[6]).toEqual({ iso: "2026-11-01", day: 1, inMonth: false });
    const inMonth = grid.flat().filter((cell) => cell.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(inMonth.map((cell) => cell.iso)).toContain("2026-10-31");
  });

  it("usa cinque o sei righe secondo il mese", () => {
    // febbraio 2026 inizia di domenica e ha 28 giorni: 6 righe.
    expect(monthGrid(2026, 2)).toHaveLength(5);
    // marzo 2026 inizia di domenica e ha 31 giorni: 6 righe.
    expect(monthGrid(2026, 3)).toHaveLength(6);
    // febbraio 2027 inizia di lunedì e ha 28 giorni: 4 righe.
    expect(monthGrid(2027, 2)).toHaveLength(4);
  });
});

describe("addDays e addMonths", () => {
  it("attraversa i confini di mese e anno", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("non-una-data", 1)).toBeNull();
  });

  it("tiene il giorno o usa l'ultimo del mese di arrivo", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-10-15", -1)).toBe("2026-09-15");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-12-10", 1)).toBe("2027-01-10");
  });
});

describe("limiti min e max", () => {
  it("disabilita le date fuori dall'intervallo e lascia aperto ciò che non è impostato", () => {
    expect(isDateDisabled("2026-10-19", "2026-10-20")).toBe(true);
    expect(isDateDisabled("2026-10-20", "2026-10-20")).toBe(false);
    expect(isDateDisabled("2026-12-31", undefined, "2026-12-30")).toBe(true);
    expect(isDateDisabled("2030-01-01")).toBe(false);
    expect(isDateDisabled("2026-02-30")).toBe(true);
  });

  it("porta una data dentro l'intervallo", () => {
    expect(clampIsoDate("2026-10-01", "2026-10-20", "2026-12-31")).toBe("2026-10-20");
    expect(clampIsoDate("2027-01-01", "2026-10-20", "2026-12-31")).toBe("2026-12-31");
    expect(clampIsoDate("2026-11-05", "2026-10-20", "2026-12-31")).toBe("2026-11-05");
  });
});

describe("todayIso e monthKey", () => {
  it("legge la data locale e il mese in forma YYYY-MM", () => {
    expect(todayIso(new Date(2026, 9, 20, 23, 30))).toBe("2026-10-20");
    expect(todayIso(new Date(2026, 0, 3))).toBe("2026-01-03");
    expect(monthKey("2027-05-12")).toBe("2027-05");
    expect(monthKey("nope")).toBeNull();
  });
});
