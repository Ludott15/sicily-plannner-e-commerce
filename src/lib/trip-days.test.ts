import { describe, expect, it } from "vitest";
import { addIsoDays, isIsoDate, partitionTrips, planRemoveDay, removeAt, romeToday, setAt, tripEndDate } from "./trip-days";

describe("date", () => {
  it("riconosce solo date ISO reali", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("26-02-01")).toBe(false);
  });

  it("aggiunge giorni attraverso fine mese e anno", () => {
    expect(addIsoDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addIsoDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addIsoDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("fine del viaggio inclusiva, null senza data", () => {
    expect(tripEndDate("2026-07-10", 3)).toBe("2026-07-12");
    expect(tripEndDate(null, 3)).toBeNull();
  });

  it("oggi è la data di Europe/Rome, anche a cavallo della mezzanotte locale", () => {
    // 2026-10-13 22:30 UTC = 2026-10-14 00:30 a Roma (ora legale, UTC+2).
    expect(romeToday(new Date("2026-10-13T22:30:00Z"))).toBe("2026-10-14");
    expect(romeToday(new Date("2026-10-13T21:30:00Z"))).toBe("2026-10-13");
  });
});

describe("partitionTrips", () => {
  const trip = (id: string, startDate: string | null, days: number) => ({ id, startDate, days });

  it("in arrivo per data crescente con le senza data in fondo, passati per data decrescente", () => {
    const { upcoming, past } = partitionTrips(
      [trip("a", "2026-09-01", 2), trip("b", null, 3), trip("c", "2026-11-05", 1), trip("d", "2026-08-01", 2), trip("e", "2026-07-01", 1)],
      "2026-10-14",
    );
    expect(upcoming.map((t) => t.id)).toEqual(["c", "b"]);
    expect(past.map((t) => t.id)).toEqual(["a", "d", "e"]);
  });

  it("il viaggio che finisce oggi è ancora in arrivo", () => {
    const { upcoming, past } = partitionTrips([trip("oggi", "2026-10-12", 3)], "2026-10-14");
    expect(upcoming.map((t) => t.id)).toEqual(["oggi"]);
    expect(past).toEqual([]);
  });
});

describe("removeAt e setAt", () => {
  it("toglie l'elemento o lascia invariato un array più corto", () => {
    expect(removeAt(["A", "B", "C"], 1)).toEqual(["A", "C"]);
    expect(removeAt(["A"], 2)).toEqual(["A"]);
  });

  it("imposta un giorno riempiendo i precedenti e senza code vuote", () => {
    expect(setAt(["A"], 2, "nota")).toEqual(["A", "", "nota"]);
    expect(setAt(["A", "B"], 1, "")).toEqual(["A"]);
    expect(setAt(["A", "B"], 0, "x")).toEqual(["x", "B"]);
  });
});

describe("planRemoveDay", () => {
  const base = { days: 4, dayTitles: ["A", "B", "C", "D"], dayNotes: ["n1", "", "n3", "n4"], dayIntros: [] as string[] };

  it("giorno in mezzo: esce la notte che lo segue, le successive scalano", () => {
    // Notti 1..3 tra i giorni. Togliendo il giorno con dayIndex 1: esce la notte 2.
    const plan = planRemoveDay({ ...base, dayIndex: 1, nights: [1, 2, 3] });
    expect(plan).toEqual({ days: 3, dayTitles: ["A", "C", "D"], dayNotes: ["n1", "n3", "n4"], dayIntros: [], nights: [{ from: 1, to: 1 }, { from: 3, to: 2 }] });
  });

  it("primo giorno: esce la notte 1", () => {
    const plan = planRemoveDay({ ...base, dayIndex: 0, nights: [1, 2, 3] });
    expect(plan?.nights).toEqual([{ from: 2, to: 1 }, { from: 3, to: 2 }]);
    expect(plan?.dayTitles).toEqual(["B", "C", "D"]);
  });

  it("ultimo giorno: esce anche l'ultima notte, che resterebbe oltre l'ultimo giorno", () => {
    const plan = planRemoveDay({ ...base, dayIndex: 3, nights: [1, 2, 3] });
    expect(plan?.days).toBe(3);
    expect(plan?.nights).toEqual([{ from: 1, to: 1 }, { from: 2, to: 2 }]);
  });

  it("rifiuta il giorno unico o fuori dal viaggio", () => {
    expect(planRemoveDay({ days: 1, dayIndex: 0, nights: [], dayTitles: [], dayNotes: [], dayIntros: [] })).toBeNull();
    expect(planRemoveDay({ ...base, dayIndex: 4, nights: [] })).toBeNull();
    expect(planRemoveDay({ ...base, dayIndex: -1, nights: [] })).toBeNull();
  });

  it("array più corti dei giorni restano coerenti", () => {
    const plan = planRemoveDay({ days: 3, dayIndex: 2, nights: [], dayTitles: ["A"], dayNotes: [], dayIntros: [] });
    expect(plan).toEqual({ days: 2, dayTitles: ["A"], dayNotes: [], dayIntros: [], nights: [] });
  });
});
