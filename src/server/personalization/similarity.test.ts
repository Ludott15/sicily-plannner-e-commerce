import { describe, expect, it } from "vitest";
import { DEFAULT_RATING, SCORE_WEIGHTS, SIMILARITY_MIN_EVENTS } from "./config";
import { fit, match, score, similarityActive, type CatalogActivity, type Profile } from "./engine";

// Similarità (M11): attiva solo da SIMILARITY_MIN_EVENTS eventi; senza mappa, o per le attività
// senza una voce, il punteggio è quello di prima (il peso della similarità va a match).

const ALL_YEAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const profile: Profile = {
  weights: { sea: 4, villages: 2 },
  budgetPerDayEur: 80,
  car: "own",
  reducedMobility: false,
  diet: [],
  pace: "balanced",
  days: 3,
  months: ALL_YEAR,
  airport: null,
};

function activity(id: string, rating: number | null): CatalogActivity {
  return {
    id,
    slug: id,
    title: id,
    placeName: "Luogo",
    area: "ovest",
    lat: 38.02,
    lng: 12.6,
    durationMin: 120,
    onSitePriceEur: 20,
    seasonMonths: ALL_YEAR,
    requiresCar: false,
    accessible: true,
    dietFriendly: [],
    rating,
    tags: [
      { key: "sea", strength: 3 },
      { key: "villages", strength: 1 },
    ],
  };
}

// Il punteggio di prima dell'M11: similarità 0, peso su match.
function legacyScore(a: CatalogActivity, p: Profile): number {
  const rating = (a.rating ?? DEFAULT_RATING) / 5;
  return (SCORE_WEIGHTS.match + SCORE_WEIGHTS.similarity) * match(a, p) + SCORE_WEIGHTS.rating * rating + SCORE_WEIGHTS.fit * fit(a, p);
}

describe("similarityActive", () => {
  it("è spenta sotto la soglia di eventi e accesa da SIMILARITY_MIN_EVENTS", () => {
    expect(SIMILARITY_MIN_EVENTS).toBe(5);
    expect(similarityActive(0)).toBe(false);
    expect(similarityActive(4)).toBe(false);
    expect(similarityActive(5)).toBe(true);
    expect(similarityActive(50)).toBe(true);
  });
});

describe("score con similarità", () => {
  it("senza mappa il punteggio è identico a quello di prima dell'M11", () => {
    const a = activity("a", 4.2);
    const b = activity("b", null);
    expect(score(a, profile)).toBe(legacyScore(a, profile));
    expect(score(b, profile)).toBe(legacyScore(b, profile));
  });

  it("un'attività senza voce nella mappa usa il peso spostato su match, come prima", () => {
    const a = activity("a", 4.2);
    const withMap: Profile = { ...profile, similarity: new Map([["altra", 0.9]]) };
    expect(score(a, withMap)).toBe(legacyScore(a, withMap));
  });

  it("con la voce nella mappa la similarità pesa SCORE_WEIGHTS.similarity", () => {
    const a = activity("a", 4.2);
    const withMap: Profile = { ...profile, similarity: new Map([["a", 0.6]]) };
    const expected =
      SCORE_WEIGHTS.match * match(a, withMap) +
      SCORE_WEIGHTS.similarity * 0.6 +
      SCORE_WEIGHTS.rating * (4.2 / 5) +
      SCORE_WEIGHTS.fit * fit(a, withMap);
    expect(score(a, withMap)).toBeCloseTo(expected, 12);
    expect(score(a, withMap)).not.toBe(score(a, profile));
  });

  it("una similarità più alta alza il punteggio, e quella negativa vale 0", () => {
    const a = activity("a", 4);
    const low: Profile = { ...profile, similarity: new Map([["a", 0.2]]) };
    const high: Profile = { ...profile, similarity: new Map([["a", 0.9]]) };
    const negative: Profile = { ...profile, similarity: new Map([["a", -0.4]]) };
    const zero: Profile = { ...profile, similarity: new Map([["a", 0]]) };
    expect(score(a, high)).toBeGreaterThan(score(a, low));
    expect(score(a, negative)).toBe(score(a, zero));
  });
});
