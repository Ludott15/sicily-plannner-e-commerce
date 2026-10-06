import { describe, expect, it } from "vitest";
import { AREA_ELIGIBILITY, DAILY_HOURS, MAX_SAME_INTEREST_PER_DAY, SINGLE_INTEREST } from "./config";
import {
  effectiveWeight,
  fit,
  interestCap,
  match,
  passesConstraints,
  propose,
  proposeTrips,
  reasons,
  score,
  type CatalogActivity,
  type Profile,
  type Proposal,
} from "./engine";

const ALL_YEAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// Centri approssimativi delle aree di prova (coordinate dei luoghi).
const CENTERS: Record<string, { lat: number; lng: number }> = {
  ovest: { lat: 38.02, lng: 12.6 },
  palermo: { lat: 38.11, lng: 13.36 },
  etna: { lat: 37.7, lng: 15.05 },
  siracusano: { lat: 37.0, lng: 15.2 },
  agrigentino: { lat: 37.29, lng: 13.5 },
  ibleo: { lat: 36.86, lng: 14.76 },
  povera: { lat: 37.37, lng: 14.33 },
};

function activity(id: string, over: Partial<CatalogActivity> = {}): CatalogActivity {
  const area = over.area ?? "ovest";
  return {
    id,
    slug: id,
    title: id,
    placeName: "Luogo",
    area,
    ...(CENTERS[area] ?? CENTERS.ovest!),
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

const tag = (key: string, strength: number) => ({ key, strength });

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

// Catalogo fisso: quattro aree idonee con caratteri diversi (ovest mare, palermo storia e arte,
// etna natura, siracusano cibo), un'area con una sola attività (mai idonea per 3 giorni) e
// attività che i vincoli devono escludere.
const catalog: CatalogActivity[] = [
  activity("ov-zingaro", { area: "ovest", placeName: "San Vito", tags: [tag("sea", 3), tag("nature_hiking", 2)], rating: 4.8, durationMin: 300 }),
  activity("ov-spiaggia", { area: "ovest", placeName: "San Vito", tags: [tag("sea", 3)], durationMin: 120, onSitePriceEur: 0 }),
  activity("ov-barca", { area: "ovest", placeName: "Trapani", tags: [tag("sea", 3)], durationMin: 90 }),
  activity("ov-egadi", { area: "ovest", placeName: "Trapani", tags: [tag("sea", 3), tag("relax", 2)], durationMin: 300, rating: 4.7 }),
  activity("ov-saline", { area: "ovest", placeName: "Trapani", tags: [tag("nature_hiking", 2)], onSitePriceEur: 10, durationMin: 120 }),
  activity("ov-couscous", { area: "ovest", placeName: "Trapani", tags: [tag("food_wine", 3)], durationMin: 180, dietFriendly: ["vegetarian"] }),
  activity("ov-erice", { area: "ovest", placeName: "Erice", tags: [tag("villages", 3), tag("history_archaeology", 1)], durationMin: 150 }),
  activity("ov-auto", { area: "ovest", placeName: "Trapani", tags: [tag("sea", 3)], requiresCar: true, rating: 5 }),
  activity("ov-inverno", { area: "ovest", tags: [tag("sea", 3)], seasonMonths: [12, 1, 2], rating: 5 }),
  activity("ov-cara", { area: "ovest", tags: [tag("sea", 3)], onSitePriceEur: 200, rating: 5 }),
  activity("ov-lunga", { area: "ovest", tags: [tag("sea", 3)], durationMin: 600, rating: 5 }),
  activity("pa-normanni", { area: "palermo", placeName: "Palermo", tags: [tag("history_archaeology", 3), tag("art", 3)], durationMin: 120, rating: 4.7 }),
  activity("pa-monreale", { area: "palermo", placeName: "Monreale", tags: [tag("art", 3), tag("history_archaeology", 2)], durationMin: 90, rating: 4.8 }),
  activity("pa-cappuccini", { area: "palermo", placeName: "Palermo", tags: [tag("history_archaeology", 3)], durationMin: 60 }),
  activity("pa-zisa", { area: "palermo", placeName: "Palermo", tags: [tag("history_archaeology", 3)], durationMin: 120 }),
  activity("pa-massimo", { area: "palermo", placeName: "Palermo", tags: [tag("art", 3)], durationMin: 45 }),
  activity("pa-ballaro", { area: "palermo", placeName: "Palermo", tags: [tag("food_wine", 3)], durationMin: 150, rating: 4.8 }),
  activity("pa-mondello", { area: "palermo", placeName: "Mondello", tags: [tag("sea", 2)], durationMin: 240, accessible: false }),
  activity("pa-notte", { area: "palermo", placeName: "Palermo", tags: [tag("nightlife", 3)], durationMin: 180 }),
  activity("et-crateri", { area: "etna", placeName: "Etna", tags: [tag("nature_hiking", 3)], durationMin: 300, rating: 4.9 }),
  activity("et-grotte", { area: "etna", placeName: "Etna", tags: [tag("nature_hiking", 3)], durationMin: 180 }),
  activity("et-alcantara", { area: "etna", placeName: "Alcantara", tags: [tag("nature_hiking", 3), tag("sea", 1)], durationMin: 180 }),
  activity("et-cantina", { area: "etna", placeName: "Etna", tags: [tag("food_wine", 3)], durationMin: 120 }),
  activity("et-taormina", { area: "etna", placeName: "Taormina", tags: [tag("history_archaeology", 3)], durationMin: 90 }),
  activity("et-isola", { area: "etna", placeName: "Taormina", tags: [tag("sea", 3)], durationMin: 180 }),
  activity("sr-mercato", { area: "siracusano", placeName: "Ortigia", tags: [tag("food_wine", 3)], durationMin: 90, dietFriendly: ["vegetarian", "vegan"] }),
  activity("sr-ortigia", { area: "siracusano", placeName: "Ortigia", tags: [tag("food_wine", 3), tag("history_archaeology", 2)], durationMin: 150 }),
  activity("sr-marzamemi", { area: "siracusano", placeName: "Marzamemi", tags: [tag("food_wine", 3), tag("villages", 2)], durationMin: 150 }),
  activity("sr-noto", { area: "siracusano", placeName: "Noto", tags: [tag("food_wine", 3), tag("art", 2)], durationMin: 120 }),
  activity("sr-neapolis", { area: "siracusano", placeName: "Siracusa", tags: [tag("history_archaeology", 3)], durationMin: 150 }),
  activity("sr-barca", { area: "siracusano", placeName: "Ortigia", tags: [tag("sea", 3)], durationMin: 90, rating: 4.4 }),
  activity("sr-pantalica", { area: "siracusano", placeName: "Pantalica", tags: [tag("nature_hiking", 3)], durationMin: 240 }),
  activity("sr-cucina", { area: "siracusano", placeName: "Ortigia", tags: [tag("food_wine", 3), tag("local_experiences", 2)], durationMin: 180, rating: 4.8 }),
  activity("sr-fontane", { area: "siracusano", placeName: "Fontane Bianche", tags: [tag("sea", 3), tag("relax", 2)], durationMin: 300 }),
  activity("ag-templi", { area: "agrigentino", placeName: "Agrigento", tags: [tag("history_archaeology", 3)], durationMin: 180, rating: 4.9 }),
  activity("ag-kolymbethra", { area: "agrigentino", placeName: "Agrigento", tags: [tag("nature_hiking", 3), tag("history_archaeology", 1)], durationMin: 90 }),
  activity("ag-scala", { area: "agrigentino", placeName: "Realmonte", tags: [tag("sea", 3)], durationMin: 150 }),
  activity("ag-eraclea", { area: "agrigentino", placeName: "Eraclea Minoa", tags: [tag("sea", 3), tag("history_archaeology", 1)], durationMin: 300 }),
  activity("ag-pirandello", { area: "agrigentino", placeName: "Agrigento", tags: [tag("art", 2), tag("history_archaeology", 2)], durationMin: 60 }),
  activity("ag-sciacca", { area: "agrigentino", placeName: "Sciacca", tags: [tag("local_experiences", 3), tag("art", 2)], durationMin: 120 }),
  activity("ag-cantina", { area: "agrigentino", placeName: "Menfi", tags: [tag("food_wine", 3), tag("relax", 1)], durationMin: 150 }),
  activity("ib-modica", { area: "ibleo", placeName: "Modica", tags: [tag("art", 3), tag("villages", 2)], durationMin: 150 }),
  activity("ib-cioccolato", { area: "ibleo", placeName: "Modica", tags: [tag("food_wine", 3), tag("local_experiences", 2)], durationMin: 120, rating: 4.8 }),
  activity("ib-scicli", { area: "ibleo", placeName: "Scicli", tags: [tag("art", 3), tag("villages", 2)], durationMin: 120 }),
  activity("ib-ibla", { area: "ibleo", placeName: "Ragusa Ibla", tags: [tag("villages", 3), tag("food_wine", 2)], durationMin: 180 }),
  activity("ib-marina", { area: "ibleo", placeName: "Marina di Ragusa", tags: [tag("sea", 3), tag("relax", 1)], durationMin: 240 }),
  activity("ib-cava", { area: "ibleo", placeName: "Cava d'Ispica", tags: [tag("nature_hiking", 3)], durationMin: 180 }),
  activity("ib-granita", { area: "ibleo", placeName: "Noto", tags: [tag("food_wine", 3)], durationMin: 60 }),
  activity("pv-villa", { area: "povera", placeName: "Piazza Armerina", tags: [tag("history_archaeology", 3), tag("art", 3)], durationMin: 150, rating: 5 }),
];

const mainOf = (a: CatalogActivity) => [...a.tags].sort((x, y) => y.strength - x.strength || x.key.localeCompare(y.key))[0]!.key;
const find = (id: string) => catalog.find((a) => a.id === id)!;

const hardConstraintsHold = (proposals: Proposal[], p: Profile) => {
  for (const proposal of proposals) {
    const seen = new Set<string>();
    expect(proposal.days.length).toBe(p.days);
    for (const day of proposal.days) {
      const minutes = day.activities.reduce((s, a) => s + a.durationMin, 0);
      expect(minutes).toBeLessThanOrEqual(DAILY_HOURS[p.pace] * 60);
      expect(minutes).toBeGreaterThanOrEqual(AREA_ELIGIBILITY.minDayFill * DAILY_HOURS[p.pace] * 60);
      const perInterest = new Map<string, number>();
      for (const a of day.activities) {
        expect(passesConstraints(a, p), a.id).toBe(true);
        expect(a.area, `${a.id} fuori area`).toBe(proposal.area);
        expect(seen.has(a.id), `${a.id} ripetuta`).toBe(false);
        seen.add(a.id);
        perInterest.set(mainOf(a), (perInterest.get(mainOf(a)) ?? 0) + 1);
      }
      for (const [k, n] of perInterest) expect(n, k).toBeLessThanOrEqual(interestCap(p)(k));
    }
  }
};

describe("filtro dei vincoli", () => {
  it("scarta fuori stagione, auto con \"niente auto\", oltre il budget, più lunghe della giornata", () => {
    const kept = catalog.filter((a) => passesConstraints(a, profile)).map((a) => a.id);
    expect(kept).not.toContain("ov-auto");
    expect(kept).not.toContain("ov-inverno");
    expect(kept).not.toContain("ov-cara");
    expect(kept).not.toContain("ov-lunga");
    expect(kept).toContain("ov-zingaro");
  });

  it("auto propria, a noleggio o non indicata: le attività in auto sono ammesse", () => {
    for (const access of ["own", "rental", null] as const) expect(passesConstraints(find("ov-auto"), { ...profile, car: access }), String(access)).toBe(true);
  });

  it("mobilità ridotta: solo attività accessibili", () => {
    expect(passesConstraints(find("pa-mondello"), { ...profile, reducedMobility: true })).toBe(false);
  });

  it("dieta: le attività di cibo devono essere indicate come adatte a tutte le diete; le altre no", () => {
    const vegan = { ...profile, diet: ["vegan"] };
    expect(passesConstraints(find("ov-couscous"), vegan)).toBe(false);
    expect(passesConstraints(find("sr-mercato"), vegan)).toBe(true);
    expect(passesConstraints(find("pa-ballaro"), vegan)).toBe(false);
    expect(passesConstraints(find("ov-barca"), vegan)).toBe(true);
    const both = { ...profile, diet: ["vegetarian", "vegan"] };
    expect(passesConstraints(find("sr-mercato"), both)).toBe(true);
    expect(passesConstraints(find("ov-couscous"), both)).toBe(false);
  });

  it("dieta: le tappe di cibo ammesse dal filtro sono segnate per la riga \"Indicativo\"", () => {
    const p = { ...profile, diet: ["vegetarian"], months: [], weights: { food_wine: 5 } };
    const stops = propose(catalog, p).flatMap((pr) => pr.days.flatMap((d) => d.activities));
    expect(stops.some((a) => a.dietChecked)).toBe(true);
    for (const a of stops) expect(a.dietChecked, a.id).toBe(a.tags.some((t) => t.key === "food_wine"));
    for (const a of propose(catalog, profile).flatMap((pr) => pr.days.flatMap((d) => d.activities))) expect(a.dietChecked).toBe(false);
  });

  it("senza mesi qualunque periodo, senza budget qualunque prezzo", () => {
    const free = { ...profile, months: [], budgetPerDayEur: null };
    expect(passesConstraints(find("ov-inverno"), free)).toBe(true);
    expect(passesConstraints(find("ov-cara"), free)).toBe(true);
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
    const a = activity("x", { tags: [tag("sea", 1)], rating: 5, onSitePriceEur: 0 });
    expect(score(a, profile)).toBeCloseTo(0.75 * 1 + 0.15 * 1 + 0.1 * 1, 10);
  });
});

describe("proposte per aree", () => {
  const free: Profile = { ...profile, months: [], car: "own", budgetPerDayEur: null };
  const areasOf = (p: Profile, c = catalog) => propose(c, p).map((pr) => pr.area);

  it("deterministiche: stesso risultato a ogni chiamata e con il catalogo in qualunque ordine", () => {
    for (const p of [profile, free, { ...free, airport: "CTA" as const }]) {
      const first = propose(catalog, p);
      expect(propose(catalog, p)).toEqual(first);
      expect(propose([...catalog].reverse(), p)).toEqual(first);
      const shuffled = [...catalog].sort((x, y) => ((x.id.length * 7 + x.id.charCodeAt(4)) % 5) - ((y.id.length * 7 + y.id.charCodeAt(4)) % 5));
      expect(propose(shuffled, p)).toEqual(first);
    }
  });

  it("con almeno tre aree idonee: tre proposte in tre aree diverse", () => {
    for (const p of [profile, free, { ...free, pace: "relaxed" as const }, { ...free, days: 2 }]) {
      const areas = areasOf(p);
      expect(areas).toHaveLength(3);
      expect(new Set(areas).size, JSON.stringify(p)).toBe(3);
      for (const pr of propose(catalog, p)) expect(pr.variant).toBeNull();
    }
  });

  it("un'area senza attività sufficienti per i giorni e il ritmo scelti non compare mai", () => {
    // "povera" ha una sola attività, la migliore del catalogo per storia e arte.
    const lover = { ...free, weights: { history_archaeology: 5, art: 5 } };
    for (const p of [lover, { ...lover, days: 1 }, { ...lover, pace: "intense" as const }, profile, free])
      expect(areasOf(p), JSON.stringify(p)).not.toContain("povera");
    // Un giorno al ritmo rilassato (4 ore, soglia 2): 150 minuti bastano.
    expect(areasOf({ ...lover, days: 1, pace: "relaxed" }, catalog.filter((a) => a.area === "povera"))).toEqual(["povera"]);
  });

  it("i profili mare, storia, natura e cibo e vino producono set di aree diversi", () => {
    const sets = ["sea", "history_archaeology", "nature_hiking", "food_wine"].map((k) =>
      areasOf({ ...free, weights: { [k]: 5 } }),
    );
    expect(sets.map((s) => s[0])).toEqual(["ovest", "palermo", "etna", "siracusano"]);
    expect(new Set(sets.map((s) => [...s].sort().join())).size).toBe(4);
  });

  it("punteggio d'area come media dei giorni, non somma: più attività non bastano a vincere", () => {
    // "grande" ha il doppio delle attività di "piccola", tutte un po' meno adatte: vince "piccola".
    const days = { ...free, days: 1, weights: { sea: 5 } };
    const big = Array.from({ length: 12 }, (_, i) => activity(`gr-${i}`, { area: "palermo", tags: [tag("sea", 2), tag("art", 1)], durationMin: 120 }));
    const small = Array.from({ length: 3 }, (_, i) => activity(`pi-${i}`, { area: "etna", tags: [tag("sea", 3)], durationMin: 120 }));
    expect(areasOf(days, [...big, ...small])[0]).toBe("etna");
  });

  it("aeroporto: piccolo bonus che rompe la parità; senza aeroporto nessun effetto", () => {
    // Due aree con attività identiche: senza aeroporto vince l'ordine alfabetico.
    const twin = ["ovest", "siracusano"].flatMap((area) =>
      [0, 1, 2].map((i) => activity(`${area}-${i}`, { area, tags: [tag("sea", 3)], durationMin: 150 })),
    );
    const one = { ...free, days: 1 };
    expect(areasOf({ ...one, airport: null }, twin)).toEqual(["ovest", "siracusano"]);
    expect(areasOf({ ...one, airport: "CTA" }, twin)).toEqual(["siracusano", "ovest"]);
    expect(areasOf({ ...one, airport: "TPS" }, twin)).toEqual(["ovest", "siracusano"]);
    // Non ribalta la classifica: un'area chiaramente migliore resta prima anche lontana.
    const better = twin.map((a) => (a.area === "ovest" ? { ...a, rating: 5 } : { ...a, rating: 3.5 }));
    expect(areasOf({ ...one, airport: "CTA" }, better)[0]).toBe("ovest");
  });

  it("motivi d'area veri: tappe per interesse contate sul viaggio, aeroporto solo se vicino", () => {
    const p = { ...free, weights: { sea: 5 }, airport: "TPS" as const };
    const [first] = propose(catalog, p);
    expect(first!.area).toBe("ovest");
    const stops = first!.days.flatMap((d) => d.activities);
    const counted = first!.reasons.find((r) => r.code === "interestStops");
    expect(counted).toEqual({
      code: "interestStops",
      interests: [{ key: "sea", stops: stops.filter((a) => a.tags.some((t) => t.key === "sea" && t.strength >= 2)).length }],
    });
    expect(first!.reasons).toContainEqual({ code: "nearAirport", airport: "TPS" });
    for (const pr of propose(catalog, { ...p, airport: null })) expect(pr.reasons.some((r) => r.code === "nearAirport")).toBe(false);
    // Ogni proposta ha almeno un motivo.
    for (const pr of propose(catalog, { ...free, weights: {} })) expect(pr.reasons.length).toBeGreaterThan(0);
  });

  it("meno di tre aree idonee: varianti della stessa area che puntano su un altro interesse, dichiarato", () => {
    const only = catalog.filter((a) => a.area === "siracusano" || a.area === "povera");
    const p = { ...free, weights: { food_wine: 5, sea: 3, nature_hiking: 3 } };
    const proposals = propose(only, p);
    expect(proposals.length).toBeGreaterThan(1);
    expect(new Set(proposals.map((pr) => pr.area))).toEqual(new Set(["siracusano"]));
    const [best, ...variants] = proposals;
    expect(best!.variant).toBeNull();
    const leanMinutes = (pr: Proposal, k: string) =>
      pr.days.flatMap((d) => d.activities).filter((a) => a.tags.some((t) => t.key === k && t.strength >= 2)).reduce((s, a) => s + a.durationMin, 0);
    const ids = (pr: Proposal) => pr.days.flatMap((d) => d.activities.map((a) => a.id)).sort().join();
    expect(new Set(proposals.map(ids)).size).toBe(proposals.length);
    expect(new Set(variants.map((v) => v.variant)).size).toBe(variants.length);
    for (const v of variants) {
      expect(v.reasons[0]).toEqual({ code: "variant", interest: v.variant });
      expect(v.variant).not.toBe("food_wine");
      expect(leanMinutes(v, v.variant!)).toBeGreaterThan(leanMinutes(best!, v.variant!));
    }
    hardConstraintsHold(proposals, p);
  });

  it("nessun vincolo violato, nessuna attività ripetuta, diversità per giorno, giorni pieni oltre la soglia", () => {
    for (const p of [
      profile,
      free,
      { ...profile, pace: "relaxed" as const, days: 2 },
      { ...profile, pace: "intense" as const, car: "own" as const, months: [] },
      { ...profile, reducedMobility: true, months: [] },
      { ...profile, diet: ["vegan"], car: "rental" as const, months: [] },
    ]) {
      hardConstraintsHold(propose(catalog, p), p);
    }
  });

  it("auto a noleggio: le tappe in auto restano e il viaggio lo segnala; con l'auto propria no", () => {
    const p = { ...profile, car: "rental" as const, months: [], weights: { sea: 5 } };
    const ovest = propose(catalog, p).find((pr) => pr.area === "ovest")!;
    expect(ovest.days.some((d) => d.activities.some((a) => a.id === "ov-auto"))).toBe(true);
    expect(ovest.needsCar).toBe(true);
    expect(ovest.reasons.some((r) => r.code === "noCar")).toBe(false);
    expect(propose(catalog, { ...p, car: "own" }).find((pr) => pr.area === "ovest")!.needsCar).toBe(false);
    for (const pr of propose(catalog, profile)) expect(pr.needsCar).toBe(false);
  });

  it("troppi giorni per il catalogo o tutto escluso: nessuna proposta", () => {
    expect(propose([], profile)).toEqual([]);
    expect(propose([find("ov-auto")], profile)).toEqual([]);
    expect(propose(catalog, { ...profile, days: 14 })).toEqual([]);
  });
});

describe("motivi Per te", () => {
  it("spiegano l'attività senza ripetere l'input", () => {
    expect(reasons(catalog[0]!, profile).slice(0, 2)).toEqual([
      { code: "combines", interests: ["sea", "nature_hiking"] },
      { code: "topRated", rating: 4.8 },
    ]);
    expect(reasons(activity("x", { tags: [tag("food_wine", 3)], rating: 4, onSitePriceEur: 0 }), profile).slice(0, 2)).toEqual([
      { code: "topForInterest", interest: "food_wine" },
      { code: "freeEntry" },
    ]);
  });

  it("l'interesse più forte dell'utente spiega un'attività che lo ha con forza 2", () => {
    const a = activity("x", { tags: [tag("sea", 2)], rating: 4, durationMin: 200 });
    expect(reasons(a, { ...profile, weights: { sea: 3, art: 2 } })).toEqual([{ code: "strongestInterest", interest: "sea" }]);
  });

  it("un interesse con peso basso non diventa un motivo", () => {
    const a = activity("x", { tags: [tag("history_archaeology", 3)], rating: 4, durationMin: 200 });
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
      { ...profile, weights: { history_archaeology: 5 }, car: "own", months: [] },
      { ...profile, weights: { food_wine: 5 }, months: [] },
      { ...profile, weights: { nature_hiking: 5, villages: 5 }, months: [] },
      { ...profile, weights: Object.fromEntries(["sea", "food_wine", "history_archaeology", "nature_hiking"].map((k) => [k, 3])) },
    ];
    for (const p of profiles) {
      const stops = propose(catalog, p).flatMap((pr) => pr.days.flatMap((d) => d.activities));
      expect(stops.length, JSON.stringify(p.weights)).toBeGreaterThan(0);
      const fallback = stops.filter((a) => a.reasons.some((r) => r.code === "bestInZone")).length;
      expect(fallback / stops.length, JSON.stringify(p.weights)).toBeLessThan(1 / 3);
    }
  });
});

describe("un solo interesse forte", () => {
  it("il limite per quell'interesse sale a 3; con due interessi forti o altri pesi sopra 2 resta 2", () => {
    expect(interestCap({ ...profile, weights: { sea: 5 } })("sea")).toBe(SINGLE_INTEREST.cap);
    expect(interestCap({ ...profile, weights: { sea: 4, art: 2, relax: 1 } })("sea")).toBe(3);
    expect(interestCap({ ...profile, weights: { sea: 4, art: 2 } })("art")).toBe(MAX_SAME_INTEREST_PER_DAY);
    expect(interestCap({ ...profile, weights: { sea: 5, art: 3 } })("sea")).toBe(MAX_SAME_INTEREST_PER_DAY);
    expect(interestCap({ ...profile, weights: { sea: 5, art: 4 } })("sea")).toBe(MAX_SAME_INTEREST_PER_DAY);
    expect(interestCap({ ...profile, weights: {} })("sea")).toBe(MAX_SAME_INTEREST_PER_DAY);
  });

  it("chi vuole solo il mare ha giorni con fino a 3 tappe di mare", () => {
    const p = { ...profile, weights: { sea: 5 }, months: [], car: "own" as const, budgetPerDayEur: null, pace: "intense" as const };
    const perDay = propose(catalog, p).flatMap((pr) => pr.days.map((d) => d.activities.filter((a) => mainOf(a) === "sea").length));
    expect(Math.max(...perDay)).toBe(3);
    hardConstraintsHold(propose(catalog, p), p);
  });
});

describe("viaggi più lunghi di quanto copra una sola area", () => {
  const free: Profile = { ...profile, months: [], car: "own", budgetPerDayEur: null };

  it("nessuna area idonea per i giorni scelti: i viaggi migliori sul massimo di giorni coperto", () => {
    const result = proposeTrips(catalog, { ...free, days: 14 });
    expect(result.shortened).toBe(true);
    expect(result.days).toBeLessThan(14);
    expect(result.proposals.length).toBeGreaterThan(0);
    for (const pr of result.proposals) expect(pr.days).toHaveLength(result.days);
    // È davvero il massimo: con un giorno in più nessuna area è idonea.
    expect(propose(catalog, { ...free, days: result.days + 1 })).toEqual([]);
    expect(result.proposals).toEqual(propose(catalog, { ...free, days: result.days }));
    hardConstraintsHold(result.proposals, { ...free, days: result.days });
  });

  it("giorni coperti: nessun accorciamento", () => {
    const result = proposeTrips(catalog, free);
    expect(result).toEqual({ proposals: propose(catalog, free), days: 3, shortened: false });
  });

  it("catalogo vuoto: nessuna proposta, nemmeno accorciata", () => {
    expect(proposeTrips([], free)).toEqual({ proposals: [], days: 3, shortened: false });
  });
});
