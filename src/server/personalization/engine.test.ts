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
    dietFriendly: [],
    rating: 4.5,
    tags: [{ key: "sea", strength: 2 }],
    ...over,
  };
}

const profile: Profile = {
  weights: { sea: 5, food_wine: 4, history_archaeology: 1, nature_hiking: 4 },
  budgetPerDayEur: 60,
  car: "none",
  reducedMobility: false,
  diet: [],
  pace: "balanced",
  days: 3,
  months: [6],
  airport: null,
};

// Catalogo fisso: tre zone con attività di vario tipo, più casi che i vincoli devono escludere.
const catalog: CatalogActivity[] = [
  activity("tp-zingaro", { zone: "TP", placeName: "San Vito", tags: [{ key: "sea", strength: 3 }, { key: "nature_hiking", strength: 2 }], rating: 4.8, durationMin: 300 }),
  activity("tp-saline", { zone: "TP", placeName: "Trapani", tags: [{ key: "nature_hiking", strength: 2 }], onSitePriceEur: 10, durationMin: 120 }),
  activity("tp-couscous", { zone: "TP", placeName: "Trapani", tags: [{ key: "food_wine", strength: 3 }], durationMin: 180, dietFriendly: ["vegetarian"] }),
  activity("tp-erice", { zone: "TP", placeName: "Erice", tags: [{ key: "history_archaeology", strength: 2 }], durationMin: 150 }),
  activity("tp-spiaggia", { zone: "TP", placeName: "San Vito", tags: [{ key: "sea", strength: 3 }], durationMin: 120, onSitePriceEur: 0 }),
  activity("tp-barca", { zone: "TP", placeName: "Trapani", tags: [{ key: "sea", strength: 3 }], durationMin: 90 }),
  activity("tp-auto", { zone: "TP", placeName: "Trapani", tags: [{ key: "sea", strength: 3 }], requiresCar: true, rating: 5 }),
  activity("tp-inverno", { zone: "TP", tags: [{ key: "sea", strength: 3 }], seasonMonths: [12, 1, 2], rating: 5 }),
  activity("tp-cara", { zone: "TP", tags: [{ key: "sea", strength: 3 }], onSitePriceEur: 200, rating: 5 }),
  activity("tp-lunga", { zone: "TP", tags: [{ key: "sea", strength: 3 }], durationMin: 600, rating: 5 }),
  activity("sr-ortigia", { zone: "SR", placeName: "Ortigia", tags: [{ key: "history_archaeology", strength: 3 }, { key: "food_wine", strength: 2 }], durationMin: 150 }),
  activity("sr-barca", { zone: "SR", placeName: "Ortigia", tags: [{ key: "sea", strength: 3 }], durationMin: 90, rating: 4.4 }),
  activity("sr-mercato", { zone: "SR", placeName: "Ortigia", tags: [{ key: "food_wine", strength: 3 }], durationMin: 90, dietFriendly: ["vegetarian", "vegan"] }),
  activity("pa-ballaro", { zone: "PA", placeName: "Palermo", tags: [{ key: "food_wine", strength: 3 }], durationMin: 150, rating: 4.8 }),
  activity("pa-mondello", { zone: "PA", placeName: "Mondello", tags: [{ key: "sea", strength: 2 }], durationMin: 240, accessible: false }),
];

const mainOf = (a: CatalogActivity) => [...a.tags].sort((x, y) => y.strength - x.strength || x.key.localeCompare(y.key))[0]!.key;

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
        perInterest.set(mainOf(a), (perInterest.get(mainOf(a)) ?? 0) + 1);
      }
      for (const n of perInterest.values()) expect(n).toBeLessThanOrEqual(MAX_SAME_INTEREST_PER_DAY);
    }
  }
};

describe("filtro dei vincoli rigidi", () => {
  it("scarta fuori stagione, auto con \"niente auto\", oltre il budget, più lunghe della giornata", () => {
    const kept = catalog.filter((a) => passesConstraints(a, profile)).map((a) => a.id);
    expect(kept).not.toContain("tp-auto");
    expect(kept).not.toContain("tp-inverno");
    expect(kept).not.toContain("tp-cara");
    expect(kept).not.toContain("tp-lunga");
    expect(kept).toContain("tp-zingaro");
  });

  it("auto propria, a noleggio o non indicata: le attività in auto sono ammesse", () => {
    const car = catalog.find((a) => a.id === "tp-auto")!;
    for (const access of ["own", "rental", null] as const) expect(passesConstraints(car, { ...profile, car: access }), String(access)).toBe(true);
  });

  it("mobilità ridotta: solo attività accessibili", () => {
    expect(passesConstraints(catalog.find((a) => a.id === "pa-mondello")!, { ...profile, reducedMobility: true })).toBe(false);
  });

  it("dieta: le attività di cibo devono essere adatte a tutte le diete indicate; le altre no", () => {
    const vegan = { ...profile, diet: ["vegan"] };
    expect(passesConstraints(catalog.find((a) => a.id === "tp-couscous")!, vegan)).toBe(false);
    expect(passesConstraints(catalog.find((a) => a.id === "sr-mercato")!, vegan)).toBe(true);
    expect(passesConstraints(catalog.find((a) => a.id === "pa-ballaro")!, vegan)).toBe(false);
    expect(passesConstraints(catalog.find((a) => a.id === "tp-barca")!, vegan)).toBe(true);
    const both = { ...profile, diet: ["vegetarian", "vegan"] };
    expect(passesConstraints(catalog.find((a) => a.id === "sr-mercato")!, both)).toBe(true);
    expect(passesConstraints(catalog.find((a) => a.id === "tp-couscous")!, both)).toBe(false);
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
    const shuffled = [...catalog].sort((x, y) => ((x.id.length * 7 + x.id.charCodeAt(1)) % 5) - ((y.id.length * 7 + y.id.charCodeAt(1)) % 5));
    expect(propose(shuffled, profile)).toEqual(first);
  });

  it("nessun vincolo rigido violato, nessuna attività ripetuta, diversità per giorno", () => {
    for (const p of [
      profile,
      { ...profile, pace: "relaxed" as const, days: 5 },
      { ...profile, pace: "intense" as const, car: "own" as const, months: [] },
      { ...profile, reducedMobility: true, budgetPerDayEur: 5 },
      { ...profile, diet: ["vegan"], car: "rental" as const },
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

  it("aeroporto: a parità di attività la zona vicina viene prima; senza aeroporto nessun effetto", () => {
    // Due zone con attività equivalenti: senza aeroporto l'ordine è alfabetico (SR, TP).
    const twin = [
      activity("sr-a", { zone: "SR", tags: [{ key: "sea", strength: 3 }] }),
      activity("tp-a", { zone: "TP", tags: [{ key: "sea", strength: 3 }] }),
    ];
    const free = { ...profile, months: [] };
    expect(propose(twin, { ...free, airport: null }).map((p) => p.zone)).toEqual(["SR", "TP"]);
    expect(propose(twin, { ...free, airport: "TPS" }).map((p) => p.zone)).toEqual(["TP", "SR"]);
    expect(propose(twin, { ...free, airport: "CIY" }).map((p) => p.zone)).toEqual(["SR", "TP"]);
  });

  it("auto a noleggio: le tappe in auto restano e il viaggio lo segnala; con l'auto propria no", () => {
    const rental = propose(catalog, { ...profile, car: "rental", months: [] });
    const tp = rental.find((p) => p.zone === "TP")!;
    expect(tp.days.some((d) => d.activities.some((a) => a.id === "tp-auto"))).toBe(true);
    expect(tp.needsCar).toBe(true);
    const own = propose(catalog, { ...profile, car: "own", months: [] }).find((p) => p.zone === "TP")!;
    expect(own.needsCar).toBe(false);
    for (const p of propose(catalog, profile)) expect(p.needsCar).toBe(false);
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
  it("spiegano l'attività senza ripetere l'input", () => {
    expect(reasons(catalog[0]!, profile).slice(0, 2)).toEqual([
      { code: "combines", interests: ["sea", "nature_hiking"] },
      { code: "topRated", rating: 4.8 },
    ]);
    expect(reasons(activity("x", { tags: [{ key: "food_wine", strength: 3 }], rating: 4, onSitePriceEur: 0 }), profile).slice(0, 2)).toEqual([
      { code: "topForInterest", interest: "food_wine" },
      { code: "freeEntry" },
    ]);
  });

  it("l'interesse più forte dell'utente spiega un'attività che lo ha con forza 2", () => {
    const a = activity("x", { tags: [{ key: "sea", strength: 2 }], rating: 4, durationMin: 200 });
    expect(reasons(a, { ...profile, weights: { sea: 3, art: 2 } })).toEqual([{ code: "strongestInterest", interest: "sea" }]);
  });

  it("un interesse con peso basso non diventa un motivo", () => {
    const a = activity("x", { tags: [{ key: "history_archaeology", strength: 3 }], rating: 4, durationMin: 200 });
    expect(reasons(a, profile)).toEqual([]);
  });

  it("ogni tappa proposta ha uno o due motivi", () => {
    for (const p of propose(catalog, profile))
      for (const d of p.days)
        for (const a of d.activities) {
          expect(a.reasons.length).toBeGreaterThanOrEqual(1);
          expect(a.reasons.length).toBeLessThanOrEqual(2);
        }
  });

  it("il motivo di ripiego compare su meno di un terzo delle tappe, con profili diversi", () => {
    const profiles: Profile[] = [
      profile,
      { ...profile, weights: { sea: 5 }, months: [] },
      { ...profile, weights: { history_archaeology: 5 }, car: "own" },
      { ...profile, weights: { food_wine: 5 }, pace: "intense" },
      { ...profile, weights: { nature_hiking: 5, villages: 5 }, months: [] },
      { ...profile, weights: Object.fromEntries(["sea", "food_wine", "history_archaeology", "nature_hiking"].map((k) => [k, 3])) },
    ];
    for (const p of profiles) {
      const stops = propose(catalog, p).flatMap((pr) => pr.days.flatMap((d) => d.activities));
      const fallback = stops.filter((a) => a.reasons.some((r) => r.code === "bestInZone")).length;
      expect(fallback / stops.length, JSON.stringify(p.weights)).toBeLessThan(1 / 3);
    }
  });
});
