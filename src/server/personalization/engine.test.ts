import { describe, expect, it } from "vitest";
import { DAILY_HOURS, MAX_SAME_INTEREST_PER_DAY } from "./config";
import {
  effectiveWeight,
  fit,
  match,
  passesConstraints,
  propose,
  reasons,
  score,
  type CatalogActivity,
  type Profile,
} from "./engine";

const ALL_YEAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function activity(id: string, over: Partial<CatalogActivity> = {}): CatalogActivity {
  return {
    id,
    slug: id,
    title: id,
    placeName: "Luogo",
    zone: "TP",
    durationMin: 120,
    onSitePriceEur: null,
    seasonMonths: ALL_YEAR,
    requiresCar: false,
    accessible: true,
    rating: 4.5,
    tags: [{ key: "sea", strength: 2 }],
    ...over,
  };
}

const profile: Profile = {
  weights: { sea: 5, food_wine: 4, history_archaeology: 1, nature_hiking: 4 },
  budgetPerDayEur: 60,
  hasCar: false,
  reducedMobility: false,
  pace: "balanced",
  days: 3,
  months: [6],
};

// Catalogo fisso: tre zone con attività di vario tipo, più casi che i vincoli devono escludere.
const catalog: CatalogActivity[] = [
  activity("tp-zingaro", { zone: "TP", tags: [{ key: "sea", strength: 3 }, { key: "nature_hiking", strength: 2 }], rating: 4.8, durationMin: 300 }),
  activity("tp-saline", { zone: "TP", tags: [{ key: "nature_hiking", strength: 2 }], onSitePriceEur: 10, durationMin: 120 }),
  activity("tp-couscous", { zone: "TP", tags: [{ key: "food_wine", strength: 3 }], durationMin: 180 }),
  activity("tp-erice", { zone: "TP", tags: [{ key: "history_archaeology", strength: 2 }], durationMin: 150 }),
  activity("tp-spiaggia", { zone: "TP", tags: [{ key: "sea", strength: 3 }], durationMin: 120, onSitePriceEur: 0 }),
  activity("tp-barca", { zone: "TP", tags: [{ key: "sea", strength: 3 }], durationMin: 90 }),
  activity("tp-auto", { zone: "TP", tags: [{ key: "sea", strength: 3 }], requiresCar: true, rating: 5 }),
  activity("tp-inverno", { zone: "TP", tags: [{ key: "sea", strength: 3 }], seasonMonths: [12, 1, 2], rating: 5 }),
  activity("tp-cara", { zone: "TP", tags: [{ key: "sea", strength: 3 }], onSitePriceEur: 200, rating: 5 }),
  activity("tp-lunga", { zone: "TP", tags: [{ key: "sea", strength: 3 }], durationMin: 600, rating: 5 }),
  activity("sr-ortigia", { zone: "SR", tags: [{ key: "history_archaeology", strength: 3 }, { key: "food_wine", strength: 2 }], durationMin: 150 }),
  activity("sr-barca", { zone: "SR", tags: [{ key: "sea", strength: 3 }], durationMin: 90, rating: 4.4 }),
  activity("sr-mercato", { zone: "SR", tags: [{ key: "food_wine", strength: 3 }], durationMin: 90 }),
  activity("pa-ballaro", { zone: "PA", tags: [{ key: "food_wine", strength: 3 }], durationMin: 150, rating: 4.8 }),
  activity("pa-mondello", { zone: "PA", tags: [{ key: "sea", strength: 2 }], durationMin: 240, accessible: false }),
];

const hardConstraintsHold = (proposals: ReturnType<typeof propose>, p: Profile) => {
  for (const proposal of proposals) {
    const seen = new Set<string>();
    for (const day of proposal.days) {
      const minutes = day.activities.reduce((s, a) => s + a.durationMin, 0);
      expect(minutes).toBeLessThanOrEqual(DAILY_HOURS[p.pace] * 60);
      const perInterest = new Map<string, number>();
      for (const a of day.activities) {
        expect(passesConstraints(a, p), a.id).toBe(true);
        expect(seen.has(a.id), `${a.id} ripetuta`).toBe(false);
        seen.add(a.id);
        const main = [...a.tags].sort((x, y) => y.strength - x.strength || x.key.localeCompare(y.key))[0]!.key;
        perInterest.set(main, (perInterest.get(main) ?? 0) + 1);
      }
      for (const n of perInterest.values()) expect(n).toBeLessThanOrEqual(MAX_SAME_INTEREST_PER_DAY);
    }
  }
};

describe("filtro dei vincoli rigidi", () => {
  it("scarta fuori stagione, auto senza auto, oltre il budget, più lunghe della giornata", () => {
    const kept = catalog.filter((a) => passesConstraints(a, profile)).map((a) => a.id);
    expect(kept).not.toContain("tp-auto");
    expect(kept).not.toContain("tp-inverno");
    expect(kept).not.toContain("tp-cara");
    expect(kept).not.toContain("tp-lunga");
    expect(kept).toContain("tp-zingaro");
  });

  it("mobilità ridotta: solo accessibili; con l'auto le attività in auto restano", () => {
    expect(passesConstraints(catalog.find((a) => a.id === "pa-mondello")!, { ...profile, reducedMobility: true })).toBe(false);
    expect(passesConstraints(catalog.find((a) => a.id === "tp-auto")!, { ...profile, hasCar: true })).toBe(true);
  });

  it("senza mesi qualunque periodo, senza budget qualunque prezzo", () => {
    const free = { ...profile, months: [], budgetPerDayEur: null };
    expect(passesConstraints(catalog.find((a) => a.id === "tp-inverno")!, free)).toBe(true);
    expect(passesConstraints(catalog.find((a) => a.id === "tp-cara")!, free)).toBe(true);
  });
});

describe("punteggio", () => {
  it("peso effettivo: explicit + implicit tra 0 e 5", () => {
    expect(effectiveWeight(4, 2)).toBe(5);
    expect(effectiveWeight(1, -2)).toBe(0);
    expect(effectiveWeight(3, 0.5)).toBe(3.5);
  });

  it("match: Σ s·w / (5 Σ s)", () => {
    // (3·5 + 2·4) / (5 · 5) = 23 / 25
    expect(match(catalog[0]!, profile)).toBeCloseTo(23 / 25, 10);
    expect(match(activity("x", { tags: [] }), profile)).toBe(0);
  });

  it("fit: prezzo nel budget e durata entro metà giornata = 1", () => {
    expect(fit(activity("x", { onSitePriceEur: 0, durationMin: 120 }), profile)).toBe(1);
    // Prezzo pari al budget: componente prezzo 0; durata ok: 0,5.
    expect(fit(activity("x", { onSitePriceEur: 60, durationMin: 120 }), profile)).toBe(0.5);
  });

  it("score: 0,75 match + 0,15 voto/5 + 0,10 fit (similarità 0)", () => {
    const a = activity("x", { tags: [{ key: "sea", strength: 1 }], rating: 5, onSitePriceEur: 0 });
    expect(score(a, profile)).toBeCloseTo(0.75 * 1 + 0.15 * 1 + 0.1 * 1, 10);
  });
});

describe("composizione greedy", () => {
  it("deterministica: stesso risultato a ogni chiamata e con il catalogo in qualunque ordine", () => {
    const first = propose(catalog, profile);
    expect(propose(catalog, profile)).toEqual(first);
    expect(propose([...catalog].reverse(), profile)).toEqual(first);
    const shuffled = [...catalog].sort((x, y) => (x.id.length * 7 + x.id.charCodeAt(1)) % 5 - (y.id.length * 7 + y.id.charCodeAt(1)) % 5);
    expect(propose(shuffled, profile)).toEqual(first);
  });

  it("nessun vincolo rigido violato, nessuna attività ripetuta, diversità per giorno", () => {
    for (const p of [
      profile,
      { ...profile, pace: "relaxed" as const, days: 5 },
      { ...profile, pace: "intense" as const, hasCar: true, months: [] },
      { ...profile, reducedMobility: true, budgetPerDayEur: 5 },
    ]) {
      hardConstraintsHold(propose(catalog, p), p);
    }
  });

  it("tre proposte su zone base diverse, la prima nella zona migliore", () => {
    const proposals = propose(catalog, profile);
    expect(proposals.map((p) => p.zone)).toEqual(["TP", "SR", "PA"]);
    expect(proposals[0]!.days[0]!.zone).toBe("TP");
    // Il primo giorno parte dall'attività con il punteggio più alto della zona.
    const best = catalog
      .filter((a) => a.zone === "TP" && passesConstraints(a, profile))
      .sort((x, y) => score(y, profile) - score(x, profile) || x.id.localeCompare(y.id))[0]!;
    expect(proposals[0]!.days[0]!.activities[0]!.id).toBe(best.id);
  });

  it("al massimo tanti giorni quanti richiesti; finite le attività di una zona si passa alla successiva", () => {
    const proposals = propose(catalog, { ...profile, days: 2 });
    for (const p of proposals) expect(p.days.length).toBeLessThanOrEqual(2);
    const long = propose(catalog, { ...profile, days: 6, pace: "intense" });
    const zones = new Set(long[0]!.days.map((d) => d.zone));
    expect(zones.size).toBeGreaterThan(1);
  });

  it("catalogo vuoto o tutto escluso: nessuna proposta", () => {
    expect(propose([], profile)).toEqual([]);
    expect(propose([catalog.find((a) => a.id === "tp-auto")!], profile)).toEqual([]);
  });
});

describe("motivi Per te", () => {
  it("spiegano l'attività senza ripetere l'input, al massimo due", () => {
    expect(reasons(catalog[0]!, profile)).toEqual([
      { code: "combines", interests: ["sea", "nature_hiking"] },
      { code: "topRated", rating: 4.8 },
    ]);
    expect(reasons(activity("x", { tags: [{ key: "food_wine", strength: 3 }], rating: 4, onSitePriceEur: 0 }), profile)).toEqual([
      { code: "topForInterest", interest: "food_wine" },
      { code: "freeEntry" },
    ]);
  });

  it("un interesse con peso basso non diventa un motivo: resta la riserva", () => {
    const a = activity("x", { tags: [{ key: "history_archaeology", strength: 3 }], rating: 4 });
    expect(reasons(a, profile)).toEqual([{ code: "bestInZone" }]);
  });

  it("ogni attività proposta ha uno o due motivi", () => {
    for (const p of propose(catalog, profile))
      for (const d of p.days)
        for (const a of d.activities) {
          expect(a.reasons.length).toBeGreaterThanOrEqual(1);
          expect(a.reasons.length).toBeLessThanOrEqual(2);
        }
  });
});
