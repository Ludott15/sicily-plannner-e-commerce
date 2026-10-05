import "server-only";
import {
  DAILY_HOURS,
  DEFAULT_RATING,
  MAX_SAME_INTEREST_PER_DAY,
  PROPOSALS,
  REASONS,
  SCORE_WEIGHTS,
} from "./config";

// Motore di personalizzazione (docs/spec.md, "Motore di personalizzazione"): codice puro e
// deterministico. Stessi profilo e catalogo, stesso risultato, in qualunque ordine arrivino
// le attività. Nessun accesso al database qui: i dati arrivano da server/personalization/data.ts.

export type Pace = keyof typeof DAILY_HOURS;

export type Profile = {
  // Peso effettivo per interesse: clamp(explicit + implicit, 0, 5).
  weights: Record<string, number>;
  budgetPerDayEur: number | null;
  hasCar: boolean;
  reducedMobility: boolean;
  pace: Pace;
  days: number;
  // Mesi possibili del viaggio; vuoto = qualunque periodo.
  months: number[];
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
  rating: number | null;
  tags: { key: string; strength: number }[];
};

// Motivo "Per te": un codice con i suoi parametri, tradotto nell'interfaccia. Spiega perché
// l'attività è adatta, senza ripetere le risposte dell'utente.
export type Reason =
  | { code: "combines"; interests: [string, string] }
  | { code: "topForInterest"; interest: string }
  | { code: "topRated"; rating: number }
  | { code: "freeEntry" }
  | { code: "inSeason" }
  | { code: "accessible" }
  // Riserva: la tappa è scelta per punteggio nella sua zona, quindi è vero per costruzione.
  | { code: "bestInZone" };

export type ScoredActivity = CatalogActivity & { score: number; reasons: Reason[] };
export type Day = { zone: string; activities: ScoredActivity[] };
export type Proposal = { zone: string; days: Day[] };

export function effectiveWeight(explicit: number, implicit: number): number {
  return Math.min(5, Math.max(0, explicit + implicit));
}

const dailyMinutes = (pace: Pace) => DAILY_HOURS[pace] * 60;

// Passo 1: vincoli rigidi. Fuori stagione, auto necessaria senza auto, non accessibile con
// mobilità ridotta, prezzo in loco oltre il budget giornaliero, più lunga di una giornata.
export function passesConstraints(a: CatalogActivity, p: Profile): boolean {
  if (p.months.length > 0 && !p.months.some((m) => a.seasonMonths.includes(m))) return false;
  if (a.requiresCar && !p.hasCar) return false;
  if (p.reducedMobility && !a.accessible) return false;
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

// Motivi reali, al massimo due, dal più forte. Non ripetono l'input ("ti piace il mare"):
// dicono cosa ha l'attività che la rende adatta.
export function reasons(a: CatalogActivity, p: Profile): Reason[] {
  const out: Reason[] = [];
  const strong = a.tags
    .filter((t) => t.strength >= REASONS.strongTag && (p.weights[t.key] ?? 0) >= REASONS.strongWeight)
    .sort((x, y) => y.strength - x.strength || x.key.localeCompare(y.key));
  if (strong.length >= 2) out.push({ code: "combines", interests: [strong[0]!.key, strong[1]!.key] });
  else if (strong.length === 1 && strong[0]!.strength === 3) out.push({ code: "topForInterest", interest: strong[0]!.key });
  if (a.rating !== null && a.rating >= REASONS.topRating) out.push({ code: "topRated", rating: a.rating });
  if (a.onSitePriceEur === 0) out.push({ code: "freeEntry" });
  if (p.months.length > 0 && a.seasonMonths.length < 12) out.push({ code: "inSeason" });
  if (p.reducedMobility && a.accessible) out.push({ code: "accessible" });
  if (out.length === 0) out.push({ code: "bestInZone" });
  return out.slice(0, 2);
}

// Ordine deterministico: punteggio, poi id.
const byScore = (x: ScoredActivity, y: ScoredActivity) => y.score - x.score || x.id.localeCompare(y.id);

// Passo 3: composizione greedy giorno per giorno, una proposta per zona base. Le zone si
// ordinano per la somma dei punteggi migliori; la proposta k parte dalla zona k e, quando un
// giorno non trova più attività nella sua zona, passa alla zona successiva in classifica.
export function propose(catalog: CatalogActivity[], p: Profile): Proposal[] {
  const days = Math.max(1, Math.min(14, p.days));
  const eligible = catalog
    .filter((a) => passesConstraints(a, p))
    .map((a) => ({ ...a, score: score(a, p), reasons: reasons(a, p) }))
    .sort(byScore);

  const zones = [...new Set(eligible.map((a) => a.zone))]
    .map((zone) => {
      const top = eligible.filter((a) => a.zone === zone).slice(0, days * 3);
      return { zone, total: top.reduce((sum, a) => sum + a.score, 0) };
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
          day = { zone, activities: picked };
          break;
        }
      }
      if (!day) break;
      for (const a of day.activities) used.add(a.id);
      plan.push(day);
    }
    if (plan.length > 0) proposals.push({ zone: start, days: plan });
  }
  return proposals;
}
