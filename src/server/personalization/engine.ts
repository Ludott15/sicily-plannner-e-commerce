import "server-only";
import {
  AIRPORT_BONUS,
  AIRPORTS,
  AREA_ELIGIBILITY,
  AREA_TOP_RATING,
  DAILY_HOURS,
  DEFAULT_RATING,
  FOOD_INTEREST,
  MAX_SAME_INTEREST_PER_DAY,
  PROPOSALS,
  REASONS,
  SCORE_WEIGHTS,
  VARIANT_FOCUS_BOOST,
} from "./config";

// Motore di personalizzazione (docs/spec.md, "Motore di personalizzazione"): codice puro e
// deterministico. Stessi profilo e catalogo, stesso risultato, in qualunque ordine arrivino
// le attività. Nessun accesso al database qui: i dati arrivano da server/personalization/data.ts.

export type Pace = keyof typeof DAILY_HOURS;
// Auto: propria, a noleggio, nessuna; null = non risposto (come il noleggio: ammesse e segnalate).
export type CarAccess = "own" | "rental" | "none";
export type Airport = keyof typeof AIRPORTS;

export type Profile = {
  // Peso effettivo per interesse: clamp(explicit + implicit, 0, 5).
  weights: Record<string, number>;
  budgetPerDayEur: number | null;
  car: CarAccess | null;
  reducedMobility: boolean;
  // Diete (vegetarian, vegan, gluten_free, lactose_free): filtro per le attività di cibo.
  // Indicativo, non una garanzia: l'interfaccia lo dice sotto le tappe filtrate.
  diet: string[];
  pace: Pace;
  days: number;
  // Mesi possibili del viaggio; vuoto = qualunque periodo.
  months: number[];
  // Aeroporto di arrivo: piccolo bonus alle aree vicine; null = nessun effetto.
  airport: Airport | null;
};

export type CatalogActivity = {
  id: string;
  slug: string;
  title: string;
  placeName: string;
  // Area di viaggio (slug) del luogo: il viaggio si compone dentro un'area.
  area: string;
  lat: number;
  lng: number;
  durationMin: number;
  onSitePriceEur: number | null;
  seasonMonths: number[];
  requiresCar: boolean;
  accessible: boolean;
  dietFriendly: string[];
  rating: number | null;
  tags: { key: string; strength: number }[];
};

// Motivo "Per te": un codice con i suoi parametri, tradotto nell'interfaccia. Spiega perché
// l'attività è adatta, senza ripetere le risposte dell'utente.
export type Reason =
  | { code: "combines"; interests: [string, string] }
  | { code: "topForInterest"; interest: string }
  | { code: "strongestInterest"; interest: string }
  | { code: "topRated"; rating: number }
  | { code: "freeEntry" }
  | { code: "inSeason" }
  | { code: "accessible" }
  | { code: "dietFriendly" }
  | { code: "samePlace" }
  | { code: "shortVisit"; minutes: number }
  // Riserva: la tappa è scelta per punteggio nella sua area, quindi è vero per costruzione.
  | { code: "bestInZone" };

// Perché quest'area: motivi calcolati dal viaggio composto, mai generici.
export type AreaReason =
  // Tappe del viaggio per gli interessi più forti dell'utente (forza del tag almeno 2).
  | { code: "interestStops"; interests: { key: string; stops: number }[] }
  | { code: "nearAirport"; airport: Airport }
  | { code: "highlyRated"; rating: number }
  // Nessuna tappa richiede l'auto (detto solo a chi non ha l'auto propria e non l'ha esclusa).
  | { code: "noCar" }
  // Meno di 3 aree idonee: variante della stessa area con un altro interesse principale.
  | { code: "variant"; interest: string }
  | { code: "stops"; stops: number; days: number };

export type ScoredActivity = CatalogActivity & {
  score: number;
  reasons: Reason[];
  // Tappa ammessa dal filtro della dieta: l'interfaccia aggiunge "Indicativo".
  dietChecked: boolean;
};
export type Day = { activities: ScoredActivity[] };
// needsCar: il viaggio ha tappe che richiedono l'auto e l'utente non ha l'auto propria.
export type Proposal = {
  area: string;
  // Interesse principale dichiarato delle varianti; null per il viaggio migliore dell'area.
  variant: string | null;
  score: number;
  days: Day[];
  needsCar: boolean;
  reasons: AreaReason[];
};

export function effectiveWeight(explicit: number, implicit: number): number {
  return Math.min(5, Math.max(0, explicit + implicit));
}

const dailyMinutes = (pace: Pace) => DAILY_HOURS[pace] * 60;
const isFood = (a: CatalogActivity) => a.tags.some((t) => t.key === FOOD_INTEREST);

// Passo 1: vincoli. Fuori stagione, auto necessaria con "niente auto", non accessibile con
// mobilità ridotta, attività di cibo non indicate come adatte alla dieta (indicazione
// dell'admin, non garanzia), prezzo in loco oltre il budget giornaliero, più lunga di una giornata.
export function passesConstraints(a: CatalogActivity, p: Profile): boolean {
  if (p.months.length > 0 && !p.months.some((m) => a.seasonMonths.includes(m))) return false;
  if (a.requiresCar && p.car === "none") return false;
  if (p.reducedMobility && !a.accessible) return false;
  if (p.diet.length > 0 && isFood(a) && !p.diet.every((d) => a.dietFriendly.includes(d))) return false;
  if (p.budgetPerDayEur !== null && a.onSitePriceEur !== null && a.onSitePriceEur > p.budgetPerDayEur) return false;
  if (a.durationMin > dailyMinutes(p.pace)) return false;
  return true;
}

// Corrispondenza con gli interessi: Σ s·w / (5 Σ s), tra 0 e 1.
export function match(a: CatalogActivity, p: Profile): number {
  const total = a.tags.reduce((sum, t) => sum + t.strength, 0);
  if (total === 0) return 0;
  const weighted = a.tags.reduce((sum, t) => sum + t.strength * (p.weights[t.key] ?? 0), 0);
  return weighted / (5 * total);
}

// Quanto prezzo e durata si adattano a budget e ritmo: 1 = perfetto, 0 = al limite.
export function fit(a: CatalogActivity, p: Profile): number {
  const price =
    p.budgetPerDayEur === null || a.onSitePriceEur === null || p.budgetPerDayEur === 0
      ? 1
      : 1 - Math.min(1, a.onSitePriceEur / p.budgetPerDayEur);
  // Fino a metà della giornata è perfetta, alla giornata intera è al limite.
  const half = dailyMinutes(p.pace) / 2;
  const duration = a.durationMin <= half ? 1 : Math.max(0, 1 - (a.durationMin - half) / half);
  return (price + duration) / 2;
}

// Passo 2: punteggio. Similarità 0 (milestone 11): il suo peso passa a match.
export function score(a: CatalogActivity, p: Profile): number {
  const rating = (a.rating ?? DEFAULT_RATING) / 5;
  return (
    (SCORE_WEIGHTS.match + SCORE_WEIGHTS.similarity) * match(a, p) +
    SCORE_WEIGHTS.rating * rating +
    SCORE_WEIGHTS.fit * fit(a, p)
  );
}

export const mainInterest = (a: CatalogActivity) =>
  [...a.tags].sort((x, y) => y.strength - x.strength || x.key.localeCompare(y.key))[0]?.key ?? "";

// Interessi con il peso più alto (più di uno a parità); vuoto se nessun peso > 0.
function strongestInterests(p: Profile): Set<string> {
  const max = Math.max(0, ...Object.values(p.weights));
  return new Set(max > 0 ? Object.keys(p.weights).filter((k) => p.weights[k] === max) : []);
}

// Motivi propri dell'attività, dal più specifico. Non ripetono l'input ("ti piace il mare"):
// dicono cosa ha l'attività che la rende adatta. I motivi che dipendono dal giorno
// (samePlace) si aggiungono nella composizione.
export function reasons(a: CatalogActivity, p: Profile): Reason[] {
  const out: Reason[] = [];
  const strong = a.tags
    .filter((t) => t.strength >= REASONS.strongTag && (p.weights[t.key] ?? 0) >= REASONS.strongWeight)
    .sort((x, y) => y.strength - x.strength || x.key.localeCompare(y.key));
  const top = strongestInterests(p);
  const topTag = a.tags
    .filter((t) => top.has(t.key) && t.strength >= REASONS.strongTag)
    .sort((x, y) => y.strength - x.strength || x.key.localeCompare(y.key))[0];
  if (strong.length >= 2) out.push({ code: "combines", interests: [strong[0]!.key, strong[1]!.key] });
  else if (strong.length === 1 && strong[0]!.strength === 3) out.push({ code: "topForInterest", interest: strong[0]!.key });
  else if (topTag) out.push({ code: "strongestInterest", interest: topTag.key });
  if (a.rating !== null && a.rating >= REASONS.topRating) out.push({ code: "topRated", rating: a.rating });
  if (a.onSitePriceEur === 0) out.push({ code: "freeEntry" });
  if (p.diet.length > 0 && isFood(a)) out.push({ code: "dietFriendly" });
  if (p.reducedMobility && a.accessible) out.push({ code: "accessible" });
  if (p.months.length > 0 && a.seasonMonths.length < 12) out.push({ code: "inSeason" });
  if (a.durationMin <= REASONS.shortVisitMin) out.push({ code: "shortVisit", minutes: a.durationMin });
  return out;
}

// Al massimo due motivi; la riserva solo se non ce n'è nessuno.
function finalReasons(own: Reason[], extra: Reason[]): Reason[] {
  const all = [...own.slice(0, 1), ...extra, ...own.slice(1)];
  return all.length > 0 ? all.slice(0, 2) : [{ code: "bestInZone" }];
}

// Ordine deterministico: punteggio, poi id.
const byScore = (x: { score: number; id: string }, y: { score: number; id: string }) => y.score - x.score || x.id.localeCompare(y.id);

// Distanza in linea d'aria in km (formula dell'emisenoverso).
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Greedy giorno per giorno dentro un'area: ogni giorno prende le attività col punteggio più
// alto che ci stanno, con al massimo N attività dello stesso interesse principale, senza
// ripetere attività nel viaggio. `pool` è già filtrato per area e ordinato con byScore.
function composeDays(pool: ScoredActivity[], days: number, minutes: number): Day[] {
  const used = new Set<string>();
  const plan: Day[] = [];
  for (let d = 0; d < days; d++) {
    const picked: ScoredActivity[] = [];
    let left = minutes;
    const perInterest = new Map<string, number>();
    for (const a of pool) {
      if (used.has(a.id) || a.durationMin > left) continue;
      const main = mainInterest(a);
      if ((perInterest.get(main) ?? 0) >= MAX_SAME_INTEREST_PER_DAY) continue;
      picked.push(a);
      left -= a.durationMin;
      perInterest.set(main, (perInterest.get(main) ?? 0) + 1);
    }
    if (picked.length === 0) break;
    for (const a of picked) used.add(a.id);
    // Motivi del giorno: una tappa nello stesso posto della precedente non chiede spostamenti.
    plan.push({
      activities: picked.map((a, i) => ({
        ...a,
        reasons: finalReasons(a.reasons, i > 0 && picked[i - 1]!.placeName === a.placeName ? [{ code: "samePlace" }] : []),
      })),
    });
  }
  return plan;
}

// Un viaggio è idoneo se riempie tutti i giorni scelti, ognuno almeno per la soglia del ritmo.
function isEligible(plan: Day[], days: number, minutes: number): boolean {
  if (plan.length < days) return false;
  return plan.every((d) => d.activities.reduce((s, a) => s + a.durationMin, 0) >= AREA_ELIGIBILITY.minDayFill * minutes);
}

// Punteggio di un giorno: media dei punteggi delle sue tappe. Non si pesa sulla durata, che
// premierebbe le attività lunghe e poco adatte; il riempimento minimo lo garantisce l'idoneità.
const dayScore = (d: Day, base: Map<string, number>) =>
  d.activities.reduce((s, a) => s + (base.get(a.id) ?? a.score), 0) / d.activities.length;

// Punteggio dell'area: media dei giorni composti, non somma. Un'area non vince perché ha più
// attività nel catalogo.
const planScore = (plan: Day[], base: Map<string, number>) => plan.reduce((s, d) => s + dayScore(d, base), 0) / plan.length;

// Interesse principale del viaggio: quello con più minuti di tappe (a parità, per chiave).
function dominantInterest(plan: Day[]): string {
  const minutes = new Map<string, number>();
  for (const d of plan) for (const a of d.activities) minutes.set(mainInterest(a), (minutes.get(mainInterest(a)) ?? 0) + a.durationMin);
  return [...minutes.entries()].sort(([ka, ma], [kb, mb]) => mb - ma || ka.localeCompare(kb))[0]?.[0] ?? "";
}

// Centro dell'area: media delle coordinate dei luoghi delle sue attività (in ordine di id).
function areaCenter(activities: CatalogActivity[]): { lat: number; lng: number } {
  const sorted = [...activities].sort((x, y) => x.id.localeCompare(y.id));
  return {
    lat: sorted.reduce((s, a) => s + a.lat, 0) / sorted.length,
    lng: sorted.reduce((s, a) => s + a.lng, 0) / sorted.length,
  };
}

// Motivi dell'area, calcolati sul viaggio composto.
function areaReasons(plan: Day[], p: Profile, airportKm: number | null): AreaReason[] {
  const out: AreaReason[] = [];
  const stops = plan.flatMap((d) => d.activities);
  const strong = Object.entries(p.weights)
    .filter(([, w]) => w >= REASONS.strongWeight)
    .map(([key]) => ({ key, stops: stops.filter((a) => a.tags.some((t) => t.key === key && t.strength >= REASONS.strongTag)).length }))
    .filter((x) => x.stops > 0)
    .sort((x, y) => y.stops - x.stops || (p.weights[y.key] ?? 0) - (p.weights[x.key] ?? 0) || x.key.localeCompare(y.key))
    .slice(0, 2);
  if (strong.length > 0) out.push({ code: "interestStops", interests: strong });
  if (p.airport && airportKm !== null && airportKm <= AIRPORT_BONUS.nearKm) out.push({ code: "nearAirport", airport: p.airport });
  const rated = stops.filter((a) => a.rating !== null);
  const mean = rated.length > 0 ? rated.reduce((s, a) => s + a.rating!, 0) / rated.length : 0;
  if (rated.length === stops.length && mean >= AREA_TOP_RATING) out.push({ code: "highlyRated", rating: Math.round(mean * 10) / 10 });
  if (p.car !== "own" && p.car !== "none" && stops.every((a) => !a.requiresCar)) out.push({ code: "noCar" });
  if (out.length === 0) out.push({ code: "stops", stops: stops.length, days: plan.length });
  return out;
}

const needsCar = (plan: Day[], p: Profile) => p.car !== "own" && plan.some((d) => d.activities.some((a) => a.requiresCar));

// Aree idonee in classifica: per ognuna il viaggio migliore composto solo al suo interno.
function rankAreas(catalog: CatalogActivity[], p: Profile) {
  const days = Math.max(1, Math.min(14, p.days));
  const minutes = dailyMinutes(p.pace);
  const eligible: ScoredActivity[] = catalog
    .filter((a) => passesConstraints(a, p))
    .map((a) => ({ ...a, score: score(a, p), reasons: reasons(a, p), dietChecked: p.diet.length > 0 && isFood(a) }))
    .sort(byScore);
  const base = new Map(eligible.map((a) => [a.id, a.score]));
  const airport = p.airport ? AIRPORTS[p.airport] : null;

  const ranked = [...new Set(eligible.map((a) => a.area))]
    .sort()
    .map((area) => {
      const pool = eligible.filter((a) => a.area === area);
      const plan = composeDays(pool, days, minutes);
      const km = airport ? distanceKm(areaCenter(catalog.filter((a) => a.area === area)), airport) : null;
      const bonus = km === null ? 0 : AIRPORT_BONUS.max * Math.max(0, 1 - km / AIRPORT_BONUS.rangeKm);
      return { area, pool, plan, km, score: isEligible(plan, days, minutes) ? planScore(plan, base) + bonus : -1 };
    })
    .filter((x) => x.score >= 0)
    .sort((x, y) => y.score - x.score || x.area.localeCompare(y.area));
  return { days, minutes, base, ranked };
}

// Aree idonee per il profilo (per l'admin "Copertura del catalogo").
export function eligibleAreas(catalog: CatalogActivity[], p: Profile): string[] {
  return rankAreas(catalog, p).ranked.map((x) => x.area);
}

// Passo 3: per ogni area compone il viaggio migliore (greedy giorno per giorno, solo dentro
// l'area) e tiene solo le aree idonee. Classifica per punteggio d'area più il piccolo bonus
// dell'aeroporto. Con almeno 3 aree idonee: tre aree diverse. Altrimenti, dopo il viaggio
// migliore di ogni area idonea, varianti della stessa area con un altro interesse principale.
export function propose(catalog: CatalogActivity[], p: Profile): Proposal[] {
  const { days, minutes, base, ranked } = rankAreas(catalog, p);

  const proposals: Proposal[] = ranked.slice(0, PROPOSALS).map((x) => ({
    area: x.area,
    variant: null,
    score: x.score,
    days: x.plan,
    needsCar: needsCar(x.plan, p),
    reasons: areaReasons(x.plan, p, x.km),
  }));

  // Varianti: interessi principali presenti nell'area, dal peso dell'utente più alto, escluso
  // quello del viaggio migliore. Una variante vale solo se resta idonea, è diversa dai viaggi
  // già proposti in quell'area e dà al suo interesse più tempo del viaggio migliore: così il
  // motivo "punta su …" è vero.
  for (const x of ranked) {
    if (proposals.length >= PROPOSALS) break;
    const sameArea = proposals.filter((pr) => pr.area === x.area);
    const signatures = new Set(sameArea.map((pr) => signature(pr.days)));
    const used = new Set([dominantInterest(x.plan), ...sameArea.map((pr) => pr.variant)]);
    const focuses = [...new Set(x.pool.map(mainInterest))]
      .filter((k) => k !== "" && !used.has(k))
      .sort((a, b) => (p.weights[b] ?? 0) - (p.weights[a] ?? 0) || a.localeCompare(b));
    for (const focus of focuses) {
      if (proposals.length >= PROPOSALS) break;
      const leans = (a: CatalogActivity) => a.tags.some((t) => t.key === focus && t.strength >= REASONS.strongTag);
      const boosted = x.pool.map((a) => ({ ...a, score: a.score + (leans(a) ? VARIANT_FOCUS_BOOST : 0) })).sort(byScore);
      const plan = composeDays(boosted, days, minutes).map((d) => ({
        activities: d.activities.map((a) => ({ ...a, score: base.get(a.id)! })),
      }));
      if (!isEligible(plan, days, minutes) || signatures.has(signature(plan))) continue;
      if (focusMinutes(plan, leans) <= focusMinutes(x.plan, leans)) continue;
      signatures.add(signature(plan));
      proposals.push({
        area: x.area,
        variant: focus,
        score: planScore(plan, base),
        days: plan,
        needsCar: needsCar(plan, p),
        reasons: [{ code: "variant", interest: focus }, ...areaReasons(plan, p, x.km).filter((r) => r.code !== "stops")],
      });
    }
  }
  return proposals;
}

// Insieme delle tappe di un viaggio, per riconoscere due viaggi uguali.
const signature = (plan: Day[]) => plan.flatMap((d) => d.activities.map((a) => a.id)).sort().join();
const focusMinutes = (plan: Day[], leans: (a: CatalogActivity) => boolean) =>
  plan.reduce((s, d) => s + d.activities.filter(leans).reduce((m, a) => m + a.durationMin, 0), 0);
