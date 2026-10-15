import { describe, expect, it } from "vitest";
import type { AreaReason, Reason } from "@/server/personalization/engine";
import {
  GROUP_PRIVACY_MIN,
  commonInterests,
  filterReasons,
  groupProfileFrom,
  parseGroupPreferences,
  type GroupPreferences,
} from "./group-profile";

const aggregate: GroupPreferences = {
  members: 3,
  withPreferences: 3,
  private: false,
  weights: { sea: 2, food_wine: 4.5, art: 3.2, villages: 2.5, relax: 1.9 },
  constraints: {
    car: "rental",
    reducedMobility: true,
    diets: ["gluten_free", "vegetarian"],
    budgetPerDayEur: 60,
    pace: "relaxed",
  },
};

describe("groupProfileFrom", () => {
  it("porta pesi e vincoli aggregati nel profilo del motore, con giorni e mesi del viaggio", () => {
    const profile = groupProfileFrom(aggregate, 4, [5, 6]);
    expect(profile.weights).toEqual(aggregate.weights);
    expect(profile.car).toBe("rental");
    expect(profile.reducedMobility).toBe(true);
    expect(profile.diet).toEqual(["gluten_free", "vegetarian"]);
    expect(profile.budgetPerDayEur).toBe(60);
    expect(profile.pace).toBe("relaxed");
    expect(profile.days).toBe(4);
    expect(profile.months).toEqual([5, 6]);
    expect(profile.airport).toBeNull();
  });

  it("non condivide gli array con l'aggregato", () => {
    const months = [5];
    const profile = groupProfileFrom(aggregate, 3, months);
    profile.diet.push("vegan");
    profile.weights.sea = 0;
    months.push(6);
    expect(aggregate.constraints.diets).toEqual(["gluten_free", "vegetarian"]);
    expect(aggregate.weights.sea).toBe(2);
    expect(profile.months).toEqual([5]);
  });

  it("con gruppo privato: pesi vuoti e nessuna dieta né mobilità ridotta nel profilo", () => {
    const privateAggregate: GroupPreferences = {
      members: 3,
      withPreferences: 2,
      private: true,
      weights: {},
      constraints: { car: "rental", reducedMobility: false, diets: [], budgetPerDayEur: 60, pace: "relaxed" },
    };
    const profile = groupProfileFrom(privateAggregate, 3, []);
    expect(profile.weights).toEqual({});
    expect(profile.diet).toEqual([]);
    expect(profile.reducedMobility).toBe(false);
    expect(profile.car).toBe("rental");
  });

  it("con nessun membro che ha completato: pesi vuoti e vincoli neutri", () => {
    const empty: GroupPreferences = {
      members: 2,
      withPreferences: 0,
      private: true,
      weights: {},
      constraints: { car: null, reducedMobility: false, diets: [], budgetPerDayEur: null, pace: "balanced" },
    };
    const profile = groupProfileFrom(empty, 3, []);
    expect(profile.weights).toEqual({});
    expect(profile.car).toBeNull();
    expect(profile.budgetPerDayEur).toBeNull();
    expect(profile.diet).toEqual([]);
  });
});

describe("commonInterests", () => {
  it("ordina per peso, poi per chiave, con livello high da 4 e medium da 2,5", () => {
    expect(commonInterests(aggregate)).toEqual([
      { key: "food_wine", level: "high" },
      { key: "art", level: "medium" },
      { key: "villages", level: "medium" },
    ]);
  });

  it("scarta i pesi sotto 2,5 e rispetta il limite", () => {
    expect(commonInterests(aggregate).map((i) => i.key)).not.toContain("sea");
    expect(commonInterests(aggregate, 1)).toEqual([{ key: "food_wine", level: "high" }]);
  });

  it("a parità di peso ordina per chiave", () => {
    const tied: GroupPreferences = { ...aggregate, weights: { villages: 3, art: 3, sea: 3 } };
    expect(commonInterests(tied, 3).map((i) => i.key)).toEqual(["art", "sea", "villages"]);
  });

  it("senza pesi non mostra nulla", () => {
    expect(commonInterests({ ...aggregate, members: 0, withPreferences: 0, private: true, weights: {} })).toEqual([]);
  });

  it("con gruppo privato non mostra nulla, anche con pesi presenti", () => {
    expect(commonInterests({ ...aggregate, withPreferences: 2, private: true })).toEqual([]);
  });
});

describe("filterReasons", () => {
  const interestReasons: Reason[] = [
    { code: "combines", interests: ["sea", "food_wine"] },
    { code: "topForInterest", interest: "art" },
    { code: "strongestInterest", interest: "villages" },
    { code: "topRated", rating: 4.8 },
    { code: "freeEntry" },
    { code: "dietFriendly" },
    { code: "accessible" },
    { code: "inSeason" },
  ];
  const logisticReasons: Reason[] = [{ code: "shortVisit", minutes: 60 }, { code: "samePlace" }, { code: "bestInZone" }];

  it("con gruppo di almeno tre membri tiene tutti i motivi", () => {
    const all = [...interestReasons, ...logisticReasons];
    expect(filterReasons(all, "group")).toEqual(all);
    expect(filterReasons(all, "group")).not.toBe(all);
  });

  it("con meno di tre membri non tiene nessun motivo d'interesse", () => {
    const all = [...interestReasons, ...logisticReasons];
    expect(filterReasons(all, "logistic")).toEqual(logisticReasons);
  });

  const areaInterest: AreaReason[] = [
    { code: "interestStops", interests: [{ key: "sea", stops: 3 }] },
    { code: "variant", interest: "art" },
    { code: "highlyRated", rating: 4.7 },
  ];
  const areaLogistic: AreaReason[] = [
    { code: "noCar" },
    { code: "nearAirport", airport: "CTA" },
    { code: "stops", stops: 6, days: 3 },
    { code: "twoAreas", areas: ["ragusa", "modica"], driveMinutes: 25 },
  ];

  it("per le aree tiene solo i motivi pratici con meno di tre membri", () => {
    expect(filterReasons([...areaInterest, ...areaLogistic], "logistic")).toEqual(areaLogistic);
    expect(filterReasons([...areaInterest, ...areaLogistic], "group")).toEqual([...areaInterest, ...areaLogistic]);
  });
});

describe("parseGroupPreferences", () => {
  it("accetta la forma della funzione SQL", () => {
    expect(parseGroupPreferences(aggregate)).toEqual(aggregate);
  });

  it("richiede il campo private", () => {
    const withoutPrivate: Record<string, unknown> = { ...aggregate };
    delete withoutPrivate.private;
    expect(() => parseGroupPreferences(withoutPrivate)).toThrow("group_preferences_invalid");
  });

  it("la soglia di privacy è 3 membri", () => {
    expect(GROUP_PRIVACY_MIN).toBe(3);
  });

  it("rifiuta un pace fuori dai valori ammessi", () => {
    expect(() => parseGroupPreferences({ ...aggregate, constraints: { ...aggregate.constraints, pace: "fast" } })).toThrow(
      "group_preferences_invalid",
    );
  });

  it("rifiuta valori non oggetto", () => {
    expect(() => parseGroupPreferences(null)).toThrow("group_preferences_invalid");
  });
});
