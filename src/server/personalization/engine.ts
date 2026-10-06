import "server-only";
import {
  AIRPORT_BONUS,
  AIRPORT_ZONES,
  DAILY_HOURS,
  DEFAULT_RATING,
  FOOD_INTEREST,
  MAX_SAME_INTEREST_PER_DAY,
  PROPOSALS,
  REASONS,
  SCORE_WEIGHTS,
} from "./config";

// Motore di personalizzazione (docs/spec.md, "Motore di personalizzazione"): codice puro e
// deterministico. Stessi profilo e catalogo, stesso risultato, in qualunque ordine arrivino
// le attività. Nessun accesso al database qui: i dati arrivano da server/personalization/data.ts.

export type Pace = keyof typeof DAILY_HOURS;
// Auto: propria, a noleggio, nessuna; null = non risposto (come il noleggio: ammesse e segnalate).
export type CarAccess = "own" | "rental" | "none";
export type Airport = keyof typeof AIRPORT_ZONES;

export type Profile = {
  // Peso effettivo per interesse: clamp(explicit + implicit, 0, 5).
  weights: Record<string, number>;
  budgetPerDayEur: number | null;
  car: CarAccess | null;
  reducedMobility: boolean;
  // Diete (vegetarian, vegan, gluten_free, lactose_free): vincolo per le attività di cibo.
  diet: string[];
  pace: Pace;
  days: number;
  // Mesi possibili del viaggio; vuoto = qualunque periodo.
  months: number[];
  // Aeroporto di arrivo: bonus alle zone vicine; null = nessun effetto.
  airport: Airport | null;
};

export type CatalogActivity = {
  id: string;
  slug: string;
  title: string;
  placeName: string;
  // Zona base: provincia del luogo.
  zone: string;
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
  // Riserva: la tappa è scelta per punteggio nella sua zona, quindi è vero per costruzione.
  | { code: "bestInZone" };

export type ScoredActivity = CatalogActivity & { score: number; reasons: Reason[] };
export type Day = { zone: string; activities: ScoredActivity[] };
// needsCar: il viaggio ha tappe che richiedono l'auto e l'utente non ha l'auto propria.
export type Proposal = { zone: string; days: Day[]; needsCar: boolean };

export function effectiveWeight(explicit: number, implicit: number): number {
  return Math.min(5, Math.max(0, explicit + implicit));
}

const dailyMinutes = (pace: Pace) => DAILY_HOURS[pace] * 60;
const isFood = (a: CatalogActivity) => a.tags.some((t) => t.key === FOOD_INTEREST);

// Passo 1: vincoli rigidi. Fuori stagione, auto necessaria con "niente auto", non accessibile
// con mobilità ridotta, attività di cibo non adatte alla dieta, prezzo in loco oltre il
// budget giornaliero, più lunga di una giornata.
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

const mainInterest = (a: CatalogActivity) =>
  [...a.tags].sort((x, y) => y.strength - x.strength || x.key.localeCompare(y.key))[0]?.key ?? "";

// Interesse con il peso più alto (a parità, il primo per chiave); null se nessun peso > 0.
function strongestInterest(p: Profile): string | null {
  const top = Object.entries(p.weights)
    .filter(([, w]) => w > 0)
    .sort(([ka, wa], [kb, wb]) => wb - wa || ka.localeCompare(kb))[0];
  return top ? top[0] : null;
}

// Motivi propri dell'attività, dal più specifico. Non ripetono l'input ("ti piace il mare"):
// dicono cosa ha l'attività che la rende adatta. I motivi che dipendono dal giorno
// (samePlace) si aggiungono nella composizione.
export function reasons(a: CatalogActivity, p: Profile): Reason[] {
  const out: Reason[] = [];
  const strong = a.tags
    .filter((t) => t.strength >= REASONS.strongTag && (p.weights[t.key] ?? 0) >= REASONS.strongWeight)
    .sort((x, y) => y.strength - x.strength || x.key.localeCompare(y.key));
  const top = strongestInterest(p);
  if (strong.length >= 2) out.push({ code: "combines", interests: [strong[0]!.key, strong[1]!.key] });
  else if (strong.length === 1 && strong[0]!.strength === 3) out.push({ code: "topForInterest", interest: strong[0]!.key });
  else if (top && a.tags.some((t) => t.key === top && t.strength >= REASONS.strongTag))
    out.push({ code: "strongestInterest", interest: top });
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
const byScore = (x: ScoredActivity, y: ScoredActivity) => y.score - x.score || x.id.localeCompare(y.id);

// Passo 3: composizione greedy giorno per giorno, una proposta per zona base. Le zone si
// ordinano per la somma dei punteggi migliori (con il bonus dell'aeroporto); la proposta k
// parte dalla zona k e, quando un giorno non trova più attività nella sua zona, passa alla
// zona successiva in classifica.
export function propose(catalog: CatalogActivity[], p: Profile): Proposal[] {
  const days = Math.max(1, Math.min(14, p.days));
  const eligible = catalog
    .filter((a) => passesConstraints(a, p))
    .map((a) => ({ ...a, score: score(a, p), reasons: reasons(a, p) }))
    .sort(byScore);
  const nearAirport = new Set<string>(p.airport ? AIRPORT_ZONES[p.airport] : []);

  const zones = [...new Set(eligible.map((a) => a.zone))]
    .map((zone) => {
      const top = eligible.filter((a) => a.zone === zone).slice(0, days * 3);
      const total = top.reduce((sum, a) => sum + a.score, 0);
      return { zone, total: nearAirport.has(zone) ? total * AIRPORT_BONUS : total };
    })
    .sort((x, y) => y.total - x.total || x.zone.localeCompare(y.zone))
    .map((z) => z.zone);

  const minutes = dailyMinutes(p.pace);
  const proposals: Proposal[] = [];
  for (const start of zones.slice(0, PROPOSALS)) {
    const order = [start, ...zones.filter((z) => z !== start)];
    const used = new Set<string>();
    const plan: Day[] = [];
    for (let d = 0; d < days; d++) {
      let day: Day | null = null;
      for (const zone of order) {
        const picked: ScoredActivity[] = [];
        let left = minutes;
        const perInterest = new Map<string, number>();
        for (const a of eligible) {
          if (a.zone !== zone || used.has(a.id) || a.durationMin > left) continue;
          const main = mainInterest(a);
          if ((perInterest.get(main) ?? 0) >= MAX_SAME_INTEREST_PER_DAY) continue;
          picked.push(a);
          left -= a.durationMin;
          perInterest.set(main, (perInterest.get(main) ?? 0) + 1);
        }
        if (picked.length > 0) {
          // Motivi del giorno: una tappa nello stesso posto della precedente non chiede spostamenti.
          const withReasons = picked.map((a, i) => ({
            ...a,
            reasons: finalReasons(a.reasons, i > 0 && picked[i - 1]!.placeName === a.placeName ? [{ code: "samePlace" }] : []),
          }));
          day = { zone, activities: withReasons };
          break;
        }
      }
      if (!day) break;
      for (const a of day.activities) used.add(a.id);
      plan.push(day);
    }
    if (plan.length > 0) {
      const needsCar = p.car !== "own" && plan.some((d) => d.activities.some((a) => a.requiresCar));
      proposals.push({ zone: start, days: plan, needsCar });
    }
  }
  return proposals;
}
