import { describe, expect, it } from "vitest";
import {
  PUBLISH_CHECK_CODES,
  dayMinutesLimit,
  isTravelParty,
  publishChecks,
  templateFacts,
  type CheckStop,
  type PublishCheck,
  type PublishInput,
} from "./itinerary-checks";

const DAILY_HOURS = { relaxed: 4, balanced: 6, intense: 8 } as const;

const activity = (overrides: Partial<NonNullable<CheckStop["activity"]>> = {}) => ({
  isActive: true,
  durationMin: 60,
  seasonMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  onSitePriceEur: null,
  requiresCar: false,
  title: "Attività di prova",
  ...overrides,
});

const stop = (dayIndex: number, activityOverrides?: Partial<NonNullable<CheckStop["activity"]>>, areaId = "area-a"): CheckStop => ({
  dayIndex,
  activity: activity(activityOverrides),
  placeAreaId: areaId,
});

// Un itinerario di due giorni valido: ogni giorno ha una tappa, il ritmo è bilanciato (360 minuti).
const valid = (overrides: Partial<PublishInput> = {}): PublishInput => ({
  days: 2,
  pace: "balanced",
  seasonMonths: [],
  stops: [stop(0, { durationMin: 120 }), stop(1, { durationMin: 200 })],
  cover: { kind: "photo", altIt: "Foto di prova" },
  dailyHours: DAILY_HOURS,
  ...overrides,
});

const check = (checks: PublishCheck[], code: string) => {
  const found = checks.find((c) => c.code === code);
  if (!found) throw new Error(`controllo mancante: ${code}`);
  return found;
};

describe("dayMinutesLimit", () => {
  it("converte le ore del ritmo in minuti", () => {
    expect(dayMinutesLimit("relaxed", DAILY_HOURS)).toBe(240);
    expect(dayMinutesLimit("balanced", DAILY_HOURS)).toBe(360);
    expect(dayMinutesLimit("intense", DAILY_HOURS)).toBe(480);
  });
});

describe("publishChecks", () => {
  it("un itinerario valido passa tutti i controlli, uno per codice, nell'ordine previsto", () => {
    const checks = publishChecks(valid());
    expect(checks.map((c) => c.code)).toEqual([...PUBLISH_CHECK_CODES]);
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks.every((c) => c.details.length === 0)).toBe(true);
  });

  describe("day_without_stops", () => {
    it("segnala i giorni senza tappe, numerati da 1", () => {
      const result = check(publishChecks(valid({ days: 3, stops: [stop(0), stop(2)] })), "day_without_stops");
      expect(result).toEqual({ code: "day_without_stops", ok: false, details: [{ day: 2 }] });
    });

    it("un giorno con solo un luogo (senza attività) conta come tappa", () => {
      const placeOnly: CheckStop = { dayIndex: 1, activity: null, placeAreaId: "area-a" };
      expect(check(publishChecks(valid({ stops: [stop(0), placeOnly] })), "day_without_stops").ok).toBe(true);
    });
  });

  describe("inactive_activity", () => {
    it("segnala le attività disattivate con il giorno e il titolo", () => {
      const checks = publishChecks(valid({ stops: [stop(0), stop(1, { isActive: false, title: "Grotta chiusa" })] }));
      expect(check(checks, "inactive_activity")).toEqual({
        code: "inactive_activity",
        ok: false,
        details: [{ day: 2, activity: "Grotta chiusa" }],
      });
    });
  });

  describe("out_of_season", () => {
    it("vuoto = tutto l'anno: nessuna tappa è fuori stagione", () => {
      const checks = publishChecks(valid({ seasonMonths: [], stops: [stop(0, { seasonMonths: [6] }), stop(1)] }));
      expect(check(checks, "out_of_season").ok).toBe(true);
    });

    it("una tappa è fuori stagione se non copre tutti i mesi consigliati", () => {
      const checks = publishChecks(
        valid({
          seasonMonths: [5, 6],
          stops: [stop(0, { seasonMonths: [5, 6, 7] }), stop(1, { seasonMonths: [6, 7], title: "Solo estate" })],
        }),
      );
      expect(check(checks, "out_of_season")).toEqual({
        code: "out_of_season",
        ok: false,
        details: [{ day: 2, activity: "Solo estate" }],
      });
    });

    it("copre tutti i mesi: passa anche se ne ha altri", () => {
      const checks = publishChecks(valid({ seasonMonths: [5, 6], stops: [stop(0, { seasonMonths: [4, 5, 6, 7] }), stop(1)] }));
      expect(check(checks, "out_of_season").ok).toBe(true);
    });
  });

  describe("day_too_long", () => {
    it("somma le durate del giorno e segnala chi supera il ritmo", () => {
      const checks = publishChecks(
        valid({ stops: [stop(0, { durationMin: 250 }), stop(0, { durationMin: 120 }), stop(1)] }),
      );
      expect(check(checks, "day_too_long")).toEqual({
        code: "day_too_long",
        ok: false,
        details: [{ day: 1, minutes: 370, limit: 360 }],
      });
    });

    it("esattamente al limite passa", () => {
      const checks = publishChecks(valid({ pace: "relaxed", stops: [stop(0, { durationMin: 240 }), stop(1)] }));
      expect(check(checks, "day_too_long").ok).toBe(true);
    });

    it("tappe senza attività contano zero minuti", () => {
      const placeOnly: CheckStop = { dayIndex: 0, activity: null, placeAreaId: null };
      const checks = publishChecks(valid({ stops: [stop(0, { durationMin: 360 }), placeOnly, stop(1)] }));
      expect(check(checks, "day_too_long").ok).toBe(true);
    });

    it("senza ritmo il limite non si applica (lo segnala pace_missing)", () => {
      const checks = publishChecks(valid({ pace: null, stops: [stop(0, { durationMin: 900 }), stop(1)] }));
      expect(check(checks, "day_too_long").ok).toBe(true);
      expect(check(checks, "pace_missing").ok).toBe(false);
    });
  });

  describe("pace_missing", () => {
    it("fallisce senza ritmo", () => {
      expect(check(publishChecks(valid({ pace: null })), "pace_missing")).toEqual({
        code: "pace_missing",
        ok: false,
        details: [],
      });
    });
  });

  describe("cover_missing", () => {
    it("fallisce senza copertina", () => {
      expect(check(publishChecks(valid({ cover: null })), "cover_missing").ok).toBe(false);
    });

    it("un'illustrazione non basta: serve una foto", () => {
      expect(check(publishChecks(valid({ cover: { kind: "illustration", altIt: "Disegno" } })), "cover_missing").ok).toBe(
        false,
      );
    });
  });

  describe("cover_alt_missing", () => {
    it("fallisce se la foto non ha il testo alternativo, anche solo spazi", () => {
      expect(check(publishChecks(valid({ cover: { kind: "photo", altIt: null } })), "cover_alt_missing").ok).toBe(false);
      expect(check(publishChecks(valid({ cover: { kind: "photo", altIt: "   " } })), "cover_alt_missing").ok).toBe(false);
    });

    it("senza foto non si applica (lo dice cover_missing)", () => {
      expect(check(publishChecks(valid({ cover: null })), "cover_alt_missing").ok).toBe(true);
      expect(check(publishChecks(valid({ cover: { kind: "illustration", altIt: null } })), "cover_alt_missing").ok).toBe(
        true,
      );
    });
  });
});

describe("templateFacts", () => {
  it("budget al giorno: somma dei prezzi divisa per i giorni, arrotondata all'euro", () => {
    const facts = templateFacts({
      days: 2,
      stops: [
        { activity: { onSitePriceEur: 10, requiresCar: false }, placeAreaId: "a" },
        { activity: { onSitePriceEur: 5, requiresCar: false }, placeAreaId: "a" },
      ],
    });
    expect(facts.budgetPerDayEur).toBe(8);
  });

  it("budget null se nessuna attività ha un prezzo; zero se tutte sono gratuite", () => {
    expect(
      templateFacts({ days: 1, stops: [{ activity: { onSitePriceEur: null, requiresCar: false }, placeAreaId: null }] })
        .budgetPerDayEur,
    ).toBeNull();
    expect(
      templateFacts({ days: 1, stops: [{ activity: { onSitePriceEur: 0, requiresCar: false }, placeAreaId: null }] })
        .budgetPerDayEur,
    ).toBe(0);
  });

  it("auto se almeno un'attività la richiede", () => {
    expect(
      templateFacts({ days: 1, stops: [{ activity: { onSitePriceEur: null, requiresCar: true }, placeAreaId: null }] })
        .requiresCar,
    ).toBe(true);
    expect(
      templateFacts({ days: 1, stops: [{ activity: null, placeAreaId: null }] }).requiresCar,
    ).toBe(false);
  });

  it("aree distinte in ordine di prima apparizione, senza quelle assenti", () => {
    const facts = templateFacts({
      days: 2,
      stops: [
        { activity: null, placeAreaId: "b" },
        { activity: null, placeAreaId: null },
        { activity: null, placeAreaId: "a" },
        { activity: null, placeAreaId: "b" },
      ],
    });
    expect(facts.areaIds).toEqual(["b", "a"]);
  });
});

describe("isTravelParty", () => {
  it("riconosce solo i valori del vocabolario", () => {
    expect(isTravelParty("couple")).toBe(true);
    expect(isTravelParty("coppia")).toBe(false);
  });
});
