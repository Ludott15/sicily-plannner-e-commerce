// Filtri della lista degli itinerari pronti nell'URL: /itinerari?giorni=2-3|4-5&area=ovest&per=couple&mese=7.
// Giorni: uno o più intervalli, separati da "|" (basta uno dei selezionati). Area, per e mese:
// uno solo. I valori sconosciuti si ignorano, come in activity-filters.ts.
// Logica pura: niente accessi al database (la query è in src/server/catalog/queries.ts).

import { isTravelParty, type TravelParty } from "./itinerary-checks";

export const DAY_BUCKETS = ["2-3", "4-5", "6-7", "8+"] as const;
export type DayBucket = (typeof DAY_BUCKETS)[number];

export const DAY_BUCKET_RANGE: Record<DayBucket, { min: number; max: number | null }> = {
  "2-3": { min: 2, max: 3 },
  "4-5": { min: 4, max: 5 },
  "6-7": { min: 6, max: 7 },
  "8+": { min: 8, max: null },
};

export type TemplateFilters = {
  days: DayBucket[];
  area: string | null;
  party: TravelParty | null;
  month: number | null;
};

export const NO_TEMPLATE_FILTERS: TemplateFilters = { days: [], area: null, party: null, month: null };

export type TemplateSearchParams = {
  giorni?: string | string[];
  area?: string | string[];
  per?: string | string[];
  mese?: string | string[];
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// In una query string "+" diventa spazio: "8+" arriva come "8 ", che qui è "8" e vale "8+".
function normalizeDayToken(raw: string): string {
  const token = raw.trim();
  return token === "8" ? "8+" : token;
}

export function parseTemplateFilters(
  params: TemplateSearchParams,
  allowed: { areas: readonly string[] },
): TemplateFilters {
  const requestedDays = new Set((first(params.giorni) ?? "").split("|").map(normalizeDayToken));
  const area = first(params.area)?.trim() ?? "";
  const party = first(params.per)?.trim() ?? "";
  const month = Number(first(params.mese)?.trim() ?? "");
  return {
    // Nell'ordine dei gruppi, così lo stesso filtro ha sempre lo stesso URL.
    days: DAY_BUCKETS.filter((bucket) => requestedDays.has(bucket)),
    area: allowed.areas.includes(area) ? area : null,
    party: isTravelParty(party) ? party : null,
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
  };
}

// Query string dei filtri, vuota senza filtri.
export function templateFiltersQuery(filters: TemplateFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.days.length > 0) query.giorni = filters.days.join("|");
  if (filters.area) query.area = filters.area;
  if (filters.party) query.per = filters.party;
  if (filters.month !== null) query.mese = String(filters.month);
  return query;
}
