// Avvisi del builder per giorno (1.4): calcolo puro, senza accessi al database.
// Il server passa il limite di minuti del ritmo (dayMinutesLimit di itinerary-checks.ts).
// Niente tempi di guida: si segnala solo il cambio di area tra due tappe consecutive.

export type WarningStop = {
  dayIndex: number;
  position: number;
  durationMin: number | null;
  areaSlug: string | null;
};

export type TripWarning =
  | { code: "day_too_long"; dayIndex: number; minutes: number; limit: number }
  | { code: "area_change"; dayIndex: number; position: number; fromArea: string; toArea: string };

// Per ogni giorno: prima la durata eccessiva, poi i cambi di area nell'ordine delle tappe.
// Due tappe consecutive con aree diverse e non nulle danno un cambio di area.
export function tripWarnings(input: { days: number; stops: WarningStop[]; limitMin: number }): TripWarning[] {
  const warnings: TripWarning[] = [];
  for (let dayIndex = 0; dayIndex < input.days; dayIndex++) {
    const day = input.stops
      .filter((stop) => stop.dayIndex === dayIndex)
      .sort((a, b) => a.position - b.position);

    const minutes = day.reduce((sum, stop) => sum + (stop.durationMin ?? 0), 0);
    if (minutes > input.limitMin) {
      warnings.push({ code: "day_too_long", dayIndex, minutes, limit: input.limitMin });
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
  }
  return warnings;
}
