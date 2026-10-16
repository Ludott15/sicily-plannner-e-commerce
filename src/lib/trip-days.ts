// Logica pura dei giorni del viaggio (builder, 1.4): date, elenco "In arrivo" / "Passati",
// rimozione di un giorno su array e notti. Nessun accesso al database né import server-only.
//
// Convenzioni: dayIndex è da 0 (come nel database). Una notte n (nightIndex da 1) sta tra il
// giorno con dayIndex n-1 e quello con dayIndex n.

export const MAX_TRIP_DAYS = 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Aggiunge n giorni a una data ISO (YYYY-MM-DD), in calendario gregoriano senza fuso.
export function addIsoDays(value: string, n: number): string {
  if (!isIsoDate(value)) throw new RangeError(`Data non valida: ${value}`);
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day + n));
  return date.toISOString().slice(0, 10);
}

// Ultimo giorno del viaggio (inclusivo); null senza data di partenza.
export function tripEndDate(startDate: string | null, days: number): string | null {
  if (startDate === null) return null;
  return addIsoDays(startDate, days - 1);
}

// "Oggi" per l'utente italiano: la data di Europe/Rome, come YYYY-MM-DD.
export function romeToday(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: "year" | "month" | "day") => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

// "In arrivo": senza data o con fine >= oggi, per data di partenza crescente (senza data in fondo).
// "Passati": fine < oggi, per data di partenza decrescente.
export function partitionTrips<T extends { startDate: string | null; days: number }>(
  trips: T[],
  today: string,
): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const trip of trips) {
    const end = tripEndDate(trip.startDate, trip.days);
    if (end !== null && end < today) past.push(trip);
    else upcoming.push(trip);
  }
  const byStartAsc = (a: T, b: T) => {
    if (a.startDate === b.startDate) return 0;
    if (a.startDate === null) return 1;
    if (b.startDate === null) return -1;
    return a.startDate < b.startDate ? -1 : 1;
  };
  upcoming.sort(byStartAsc);
  past.sort((a, b) => byStartAsc(b, a));
  return { upcoming, past };
}

// Rimuove l'elemento all'indice dato; un array più corto del giorno non cambia.
export function removeAt<T>(values: readonly T[], index: number): T[] {
  return index < values.length ? values.filter((_, i) => i !== index) : [...values];
}

// Imposta il valore del giorno dato, riempiendo i giorni prima con stringhe vuote. Le stringhe
// vuote in coda non si salvano.
export function setAt(values: readonly string[], index: number, value: string): string[] {
  const next = Array.from({ length: Math.max(values.length, index + 1) }, (_, i) =>
    i === index ? value : (values[i] ?? ""),
  );
  while (next.length > 0 && next[next.length - 1] === "") next.pop();
  return next;
}

export type RemoveDayInput = {
  days: number;
  dayIndex: number;
  nights: readonly number[];
  dayTitles: readonly string[];
  dayNotes: readonly string[];
  dayIntros: readonly string[];
};

export type RemoveDayPlan = {
  days: number;
  dayTitles: string[];
  dayNotes: string[];
  dayIntros: string[];
  // Notti rimaste: from è il nightIndex attuale, to quello nuovo (cambia solo dopo il giorno tolto).
  nights: { from: number; to: number }[];
};

// Togliere il giorno k (dayIndex): il giorno k esce con i suoi titoli, note e introduzioni; le
// notti: la notte k+1 (tra il giorno tolto e il successivo) esce, le successive scalano di uno.
// Togliendo l'ultimo giorno esce anche la notte k, che resterebbe oltre l'ultimo giorno.
// Ritorna null se il giorno non esiste o se è l'unico.
// Le tappe non passano da qui: il database le sposta con due istruzioni set-based.
export function planRemoveDay(input: RemoveDayInput): RemoveDayPlan | null {
  const { days, dayIndex } = input;
  if (days <= 1 || dayIndex < 0 || dayIndex >= days) return null;
  const newDays = days - 1;

  const nights = input.nights.flatMap((from) => {
    if (from === dayIndex + 1) return [];
    const to = from > dayIndex + 1 ? from - 1 : from;
    return to >= 1 && to <= newDays - 1 ? [{ from, to }] : [];
  });

  return {
    days: newDays,
    dayTitles: removeAt(input.dayTitles, dayIndex),
    dayNotes: removeAt(input.dayNotes, dayIndex),
    dayIntros: removeAt(input.dayIntros, dayIndex),
    nights,
  };
}
