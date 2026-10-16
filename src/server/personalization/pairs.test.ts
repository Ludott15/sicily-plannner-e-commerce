import { describe, expect, it } from "vitest";
import { pairKey, type DriveTimes } from "@/lib/drive-pairs";
import { AREA_ELIGIBILITY, DAILY_HOURS } from "./config";
import { firstAreaDays, pairCandidates, visitOrder } from "./pairs";
import { propose, proposeTrips, type CatalogActivity, type Day, type Profile, type Proposal } from "./engine";

const ALL_YEAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// Attività di prova: 120 minuti, un solo interesse (mare, forza 3). Con il peso 5 per il mare
// ogni giorno ne prende tre (limite per interesse), quindi 360 minuti: la giornata del ritmo medio.
function act(id: string, area: string, rating = 4.5): CatalogActivity {
  return {
    id,
    slug: id,
    title: id,
    placeName: "Luogo",
    area,
    lat: 38,
    lng: 13,
    durationMin: 120,
    onSitePriceEur: null,
    seasonMonths: ALL_YEAR,
    requiresCar: false,
    accessible: true,
    dietFriendly: [],
    rating,
    tags: [{ key: "sea", strength: 3 }],
  };
}

const areaActs = (area: string, count: number, rating?: number): CatalogActivity[] =>
  Array.from({ length: count }, (_, i) => act(`${area}-${i}`, area, rating));

const profile: Profile = {
  weights: { sea: 5 },
  budgetPerDayEur: null,
  car: "own",
  reducedMobility: false,
  diet: [],
  pace: "balanced",
  days: 2,
  months: [],
  airport: null,
};

const driveTimes = (...entries: [string, string, number][]): DriveTimes =>
  new Map(entries.map(([a, b, minutes]) => [pairKey(a, b), minutes]));

const minutesOf = (d: Day) => d.activities.reduce((s, a) => s + a.durationMin, 0);
const pairsOf = (proposals: Proposal[]) => proposals.filter((pr) => pr.areas.length === 2);

// Regole di ogni viaggio su due aree: giorni pieni nei limiti (quello di trasferimento ridotto
// della guida), nessuna attività ripetuta, ogni tappa nella sua area.
function expectPairRules(pr: Proposal, p: Profile) {
  const limit = DAILY_HOURS[p.pace] * 60;
  const seen = new Set<string>();
  expect(pr.days).toHaveLength(p.days);
  pr.days.forEach((d, i) => {
    const max = pr.transfer && pr.transfer.dayIndex === i ? limit - pr.transfer.minutes : limit;
    expect(minutesOf(d), `giorno ${i}`).toBeLessThanOrEqual(max);
    expect(minutesOf(d), `giorno ${i}`).toBeGreaterThanOrEqual(AREA_ELIGIBILITY.minDayFill * max);
    for (const a of d.activities) {
      expect(seen.has(a.id), `${a.id} ripetuta`).toBe(false);
      seen.add(a.id);
      expect(pr.areas).toContain(a.area);
    }
  });
}

describe("coppie di aree: candidate, quote, ordine", () => {
  it("coppie in ordine di chiave, solo quelle entro la soglia", () => {
    const dt = driveTimes(["palermo", "ovest", 60], ["etna", "ovest", 151], ["etna", "palermo", 90]);
    expect(pairCandidates(dt, 150).map((c) => c.key)).toEqual(["etna+palermo", "ovest+palermo"]);
  });

  it("firstAreaDays: proporzionale, almeno un giorno per area; meno di due giorni non si compone", () => {
    expect(firstAreaDays(3, 1, 1)).toBe(2);
    expect(firstAreaDays(2, 1, 1)).toBe(1);
    expect(firstAreaDays(4, 9, 1)).toBe(3);
    expect(firstAreaDays(2, 0, 5)).toBe(1);
    expect(firstAreaDays(1, 1, 1)).toBeNull();
    expect(firstAreaDays(3, 0, 0)).toBeNull();
  });

  it("visitOrder: prima la quota più alta, a parità lo slug", () => {
    expect(visitOrder({ area: "ovest", share: 1 }, { area: "palermo", share: 2 })[0].area).toBe("palermo");
    expect(visitOrder({ area: "palermo", share: 1 }, { area: "ovest", share: 1 })[0].area).toBe("ovest");
  });
});

describe("composizione di una coppia", () => {
  const catalog = [...areaActs("ovest", 4), ...areaActs("palermo", 4)];

  it("due giorni: il secondo passa all'altra area, con il giorno di trasferimento ridotto", () => {
    const out = propose(catalog, profile, driveTimes(["ovest", "palermo", 60]));
    expect(out.map((pr) => pr.area)).toEqual(["ovest+palermo"]);
    const [pr] = out;
    expect(pr!.areas).toEqual(["ovest", "palermo"]);
    expect(pr!.transfer).toEqual({ dayIndex: 1, minutes: 60 });
    expect(pr!.reasons[0]).toEqual({ code: "twoAreas", areas: ["ovest", "palermo"], driveMinutes: 60 });
    expect(pr!.days[0]!.activities.every((a) => a.area === "ovest")).toBe(true);
    expect(pr!.days[1]!.activities.every((a) => a.area === "palermo")).toBe(true);
    expectPairRules(pr!, profile);
  });

  it("soglia: la guida oltre maxDriveMin (150) non compone; la guida mancante neanche", () => {
    expect(propose(catalog, profile, driveTimes(["ovest", "palermo", 151]))).toEqual([]);
    expect(propose(catalog, profile, driveTimes(["ovest", "palermo", 150]))).toHaveLength(1);
    expect(propose(catalog, profile, driveTimes(["ovest", "etna", 60]))).toEqual([]);
    expect(propose(catalog, profile, new Map())).toEqual([]);
  });

  it("la ripartizione dà più giorni alla prima area, quella con il punteggio più alto", () => {
    const strong = [...areaActs("ovest", 6, 5), ...areaActs("palermo", 6, 3.5)];
    const out = propose(strong, { ...profile, days: 3 }, driveTimes(["ovest", "palermo", 60]));
    const [pr] = pairsOf(out);
    expect(pr).toBeDefined();
    expect(pr!.areas[0]).toBe("ovest");
    const firstDays = pr!.days.filter((d) => d.activities[0]!.area === "ovest").length;
    const secondDays = pr!.days.length - firstDays;
    expect(firstDays).toBeGreaterThanOrEqual(secondDays);
    expect(pr!.transfer!.dayIndex).toBe(firstDays);
    expectPairRules(pr!, { ...profile, days: 3 });
  });

  it("punteggi uguali: giorni divisi, la prima area è quella in ordine alfabetico", () => {
    const out = propose(catalog, profile, driveTimes(["palermo", "ovest", 60]));
    expect(out[0]!.areas).toEqual(["ovest", "palermo"]);
    expect(out[0]!.transfer!.dayIndex).toBe(1);
  });

  it("la composizione non dipende dall'ordine del catalogo né dalla chiave della matrice", () => {
    const dt = driveTimes(["ovest", "palermo", 60]);
    expect(propose([...catalog].reverse(), profile, dt)).toEqual(propose(catalog, profile, dt));
  });

  it("matrice vuota: il risultato è identico a quello senza coppie", () => {
    const more = [...catalog, ...areaActs("etna", 9)];
    expect(propose(more, profile, new Map())).toEqual(propose(more, profile));
  });
});

describe("proposte con più coppie possibili", () => {
  const catalog = [...areaActs("ovest", 4), ...areaActs("palermo", 4), ...areaActs("etna", 4)];
  const all = driveTimes(["ovest", "palermo", 60], ["ovest", "etna", 60], ["palermo", "etna", 60]);

  it("al massimo una coppia tra le proposte", () => {
    const out = propose(catalog, profile, all);
    expect(pairsOf(out)).toHaveLength(1);
    expect(out).toHaveLength(1);
  });

  it("proposeTrips: una coppia idonea evita l'accorciamento", () => {
    const result = proposeTrips(catalog, profile, all);
    expect(result.shortened).toBe(false);
    expect(result.days).toBe(2);
    expect(result.proposals).toEqual(propose(catalog, profile, all));
  });
});
