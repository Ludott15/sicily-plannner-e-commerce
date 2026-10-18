// Avvisi del builder per giorno (1.4): calcolo puro, senza accessi al database.
// Il server passa il limite di minuti del ritmo (dayMinutesLimit di itinerary-checks.ts).
// Tempi di guida (1.5): con la matrice, il giorno di trasferimento tra due aree ha un limite
// più basso (limite meno la guida) e un avviso dedicato.

import { pairKey, type DriveTimes } from "./drive-pairs";

export type WarningStop = {
  dayIndex: number;
  position: number;
  durationMin: number | null;
  areaSlug: string | null;
};

export type TripWarning =
  | { code: "day_too_long"; dayIndex: number; minutes: number; limit: number }
  | { code: "area_change"; dayIndex: number; position: number; fromArea: string; toArea: string }
  // day: indice del giorno (0-based, come dayIndex); minutes: guida tra le due aree.
  | { code: "transfer_day"; day: number; minutes: number };

// Per ogni giorno: prima il giorno di trasferimento (se la prima tappa è in un'altra area di quella
// del giorno precedente e la coppia è in matrice), poi la durata eccessiva, poi i cambi di area
// nell'ordine delle tappe. Due tappe consecutive con aree diverse e non nulle danno un cambio di area.
export function tripWarnings(input: {
  days: number;
  stops: WarningStop[];
  limitMin: number;
  driveTimes?: DriveTimes;
}): TripWarning[] {
  const warnings: TripWarning[] = [];
  let previousArea: string | null = null;
  for (let dayIndex = 0; dayIndex < input.days; dayIndex++) {
    const day = input.stops
      .filter((stop) => stop.dayIndex === dayIndex)
      .sort((a, b) => a.position - b.position);

    let limit = input.limitMin;
    const firstArea = day[0]?.areaSlug ?? null;
    if (input.driveTimes && previousArea !== null && firstArea !== null && previousArea !== firstArea) {
      const minutes = input.driveTimes.get(pairKey(previousArea, firstArea));
      if (minutes !== undefined) {
        warnings.push({ code: "transfer_day", day: dayIndex, minutes });
        limit -= minutes;
      }
    }

    const minutes = day.reduce((sum, stop) => sum + (stop.durationMin ?? 0), 0);
    if (minutes > limit) {
      warnings.push({ code: "day_too_long", dayIndex, minutes, limit });
    }

    for (let i = 1; i < day.length; i++) {
      const previous = day[i - 1]!;
      const current = day[i]!;
      if (previous.areaSlug !== null && current.areaSlug !== null && previous.areaSlug !== current.areaSlug) {
        warnings.push({
          code: "area_change",
          dayIndex,
          position: current.position,
          fromArea: previous.areaSlug,
          toArea: current.areaSlug,
        });
      }
    }
    previousArea = day.at(-1)?.areaSlug ?? null;
  }
  return warnings;
}
