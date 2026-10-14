import { describe, expect, it } from "vitest";
import { tripWarnings } from "./trip-warnings";

describe("tripWarnings", () => {
  it("segnala il giorno che supera il limite del ritmo, non quello uguale", () => {
    const stops = [
      { dayIndex: 0, position: 0, durationMin: 200, areaSlug: null },
      { dayIndex: 0, position: 1, durationMin: 160, areaSlug: null },
      { dayIndex: 1, position: 0, durationMin: 360, areaSlug: null },
    ];
    // 360 minuti con limite 360: non supera il limite.
    expect(tripWarnings({ days: 2, stops, limitMin: 360 })).toEqual([]);
    expect(tripWarnings({ days: 2, stops, limitMin: 359 })).toEqual([
      { code: "day_too_long", dayIndex: 0, minutes: 360, limit: 359 },
      { code: "day_too_long", dayIndex: 1, minutes: 360, limit: 359 },
    ]);
  });

  it("il cambio di area vale tra tappe consecutive nell'ordine delle posizioni", () => {
    const stops = [
      { dayIndex: 0, position: 2, durationMin: null, areaSlug: "palermo" },
      { dayIndex: 0, position: 0, durationMin: null, areaSlug: "ovest" },
      { dayIndex: 0, position: 1, durationMin: null, areaSlug: "ovest" },
    ];
    expect(tripWarnings({ days: 1, stops, limitMin: 360 })).toEqual([
      { code: "area_change", dayIndex: 0, position: 2, fromArea: "ovest", toArea: "palermo" },
    ]);
  });

  it("un'area nulla non fa scattare il cambio, né una tappa che la lascia tra due della stessa", () => {
    const stops = [
      { dayIndex: 0, position: 0, durationMin: null, areaSlug: "ovest" },
      { dayIndex: 0, position: 1, durationMin: null, areaSlug: null },
      { dayIndex: 0, position: 2, durationMin: null, areaSlug: "ovest" },
    ];
    expect(tripWarnings({ days: 1, stops, limitMin: 360 })).toEqual([]);
  });

  it("un giorno vuoto o senza tappe non dà avvisi", () => {
    expect(tripWarnings({ days: 3, stops: [], limitMin: 240 })).toEqual([]);
  });
});
