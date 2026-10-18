// Controlli di pubblicazione e fatti di un itinerario pronto (1.3). Logica pura: il server
// (src/server/catalog/templates.admin.ts) legge i dati e passa tappe, ore del ritmo e copertina.
// Niente accessi al database né import server-only qui.
//
// Convenzioni: il giorno nei dettagli dei controlli è numerato da 1 (come nell'interfaccia),
// mentre dayIndex delle tappe è da 0.

export const PACES = ["relaxed", "balanced", "intense"] as const;
export type Pace = (typeof PACES)[number];

export const TIME_SLOTS = ["morning", "lunch", "afternoon", "evening"] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];

export const TRAVEL_PARTIES = ["solo", "couple", "family", "friends"] as const;
export type TravelParty = (typeof TRAVEL_PARTIES)[number];

export function isTravelParty(value: string): value is TravelParty {
  return (TRAVEL_PARTIES as readonly string[]).includes(value);
}

export type CheckStop = {
  dayIndex: number;
  activity: {
    isActive: boolean;
    durationMin: number;
    seasonMonths: number[];
    onSitePriceEur: number | null;
    requiresCar: boolean;
    title: string;
  } | null;
  placeAreaId: string | null;
};

export type PublishCheckCode =
  | "day_without_stops"
  | "inactive_activity"
  | "out_of_season"
  | "day_too_long"
  | "pace_missing"
  | "cover_missing"
  | "cover_alt_missing";

export const PUBLISH_CHECK_CODES: readonly PublishCheckCode[] = [
  "day_without_stops",
  "inactive_activity",
  "out_of_season",
  "day_too_long",
  "pace_missing",
  "cover_missing",
  "cover_alt_missing",
];

export type PublishCheckDetail = { day?: number; activity?: string; minutes?: number; limit?: number };

export type PublishCheck = { code: PublishCheckCode; ok: boolean; details: PublishCheckDetail[] };

export type PublishCover = { kind: "photo" | "illustration"; altIt: string | null };

export type PublishInput = {
  days: number;
  pace: Pace | null;
  seasonMonths: number[];
  stops: CheckStop[];
  // Copertina già risolta con la catena dell'itinerario (propria → prima tappa → area).
  cover: PublishCover | null;
  dailyHours: Record<Pace, number>;
};

// Minuti di attività al giorno consentiti dal ritmo.
export function dayMinutesLimit(pace: Pace, dailyHours: Record<Pace, number>): number {
  return Math.round(dailyHours[pace] * 60);
}

// Un elemento per codice, sempre tutti (ok true o false), nell'ordine di PUBLISH_CHECK_CODES.
// Il controllo della copertina per il testo alternativo non si applica senza foto: lo dice già
// cover_missing, quindi resta ok.
export function publishChecks(input: PublishInput): PublishCheck[] {
  const { days, pace, seasonMonths, stops, cover, dailyHours } = input;

  const stopsByDay = new Map<number, CheckStop[]>();
  for (const stop of stops) {
    const list = stopsByDay.get(stop.dayIndex) ?? [];
    list.push(stop);
    stopsByDay.set(stop.dayIndex, list);
  }

  const emptyDays: PublishCheckDetail[] = [];
  const tooLong: PublishCheckDetail[] = [];
  const limit = pace === null ? null : dayMinutesLimit(pace, dailyHours);
  for (let day = 0; day < days; day++) {
    const dayStops = stopsByDay.get(day) ?? [];
    if (dayStops.length === 0) emptyDays.push({ day: day + 1 });
    if (limit !== null) {
      const minutes = dayStops.reduce((sum, stop) => sum + (stop.activity?.durationMin ?? 0), 0);
      if (minutes > limit) tooLong.push({ day: day + 1, minutes, limit });
    }
  }

  const inactive: PublishCheckDetail[] = [];
  const outOfSeason: PublishCheckDetail[] = [];
  for (const stop of stops) {
    const activity = stop.activity;
    if (activity === null) continue;
    if (!activity.isActive) inactive.push({ day: stop.dayIndex + 1, activity: activity.title });
    // Vuoto = tutto l'anno: nessuna tappa può essere fuori stagione.
    const coversAll = seasonMonths.every((month) => activity.seasonMonths.includes(month));
    if (seasonMonths.length > 0 && !coversAll) outOfSeason.push({ day: stop.dayIndex + 1, activity: activity.title });
  }

  const photoCover = cover !== null && cover.kind === "photo";
  const altOk = cover === null || cover.kind !== "photo" || (cover.altIt?.trim() ?? "") !== "";

  return [
    { code: "day_without_stops", ok: emptyDays.length === 0, details: emptyDays },
    { code: "inactive_activity", ok: inactive.length === 0, details: inactive },
    { code: "out_of_season", ok: outOfSeason.length === 0, details: outOfSeason },
    { code: "day_too_long", ok: tooLong.length === 0, details: tooLong },
    { code: "pace_missing", ok: pace !== null, details: [] },
    { code: "cover_missing", ok: photoCover, details: [] },
    { code: "cover_alt_missing", ok: altOk, details: [] },
  ];
}

// Dati che il pubblico vede in testa alla pagina: non si salvano, si calcolano.
export type FactStop = {
  activity: { onSitePriceEur: number | null; requiresCar: boolean } | null;
  placeAreaId: string | null;
};

export type TemplateFacts = {
  // Somma dei prezzi in loco delle attività divisa per i giorni, arrotondata all'euro; null se nessuna ha un prezzo.
  budgetPerDayEur: number | null;
  requiresCar: boolean;
  // Aree distinte dei luoghi delle tappe, in ordine di prima apparizione (le tappe arrivano già ordinate).
  areaIds: string[];
};

export function templateFacts(input: { days: number; stops: FactStop[] }): TemplateFacts {
  const prices = input.stops.flatMap((stop) => {
    const price = stop.activity?.onSitePriceEur ?? null;
    return price === null ? [] : [price];
  });
  const total = prices.reduce((sum, price) => sum + price, 0);
  const budgetPerDayEur = prices.length === 0 ? null : Math.round(total / Math.max(1, input.days));

  return {
    budgetPerDayEur,
    requiresCar: input.stops.some((stop) => stop.activity?.requiresCar === true),
    areaIds: [...new Set(input.stops.flatMap((stop) => (stop.placeAreaId ? [stop.placeAreaId] : [])))],
  };
}
