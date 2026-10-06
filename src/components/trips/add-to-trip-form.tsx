"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { suggestDay } from "@/lib/trips";
import { addToTrip, type TripActionError } from "@/server/trips/actions";

// "Aggiungi al viaggio" (M5): scelta del viaggio e del giorno. Il giorno proposto è quello
// compatibile per area (suggestDay); se il viaggio è in un'altra zona, lo diciamo prima.
export type PickerTrip = { id: string; title: string; days: number; dayAreas: string[][]; dayStops: number[] };

export function AddToTripForm({
  locale,
  activityId,
  activityArea,
  areaNames,
  trips,
}: {
  locale: string;
  activityId: string;
  activityArea: string | null;
  areaNames: Record<string, string>;
  trips: PickerTrip[];
}) {
  const t = useTranslations("Trips");
  const [tripId, setTripId] = useState(trips[0]!.id);
  const trip = trips.find((x) => x.id === tripId)!;
  const suggestion = suggestDay(trip.dayAreas, trip.dayStops, activityArea);
  const [dayByTrip, setDayByTrip] = useState<Record<string, number>>({});
  const day = dayByTrip[tripId] ?? suggestion.day;
  const [error, setError] = useState<TripActionError["code"] | null>(null);
  const [pending, startTransition] = useTransition();
  const tripAreas = [...new Set(trip.dayAreas.flat())].map((a) => areaNames[a] ?? a);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addToTrip({ locale, itineraryId: tripId, activityId, dayIndex: day });
      if (result?.status === "error") setError(result.code);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <label className="flex flex-col gap-2 text-body-s font-semibold">
        {t("pickTrip")}
        <select
          value={tripId}
          onChange={(e) => setTripId(e.target.value)}
          className="min-h-11 rounded-md border border-divider bg-calce px-3 text-body font-normal"
        >
          {trips.map((x) => (
            <option key={x.id} value={x.id}>
              {x.title}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-body-s font-semibold">
        {t("pickDay")}
        <select
          value={day}
          onChange={(e) => setDayByTrip({ ...dayByTrip, [tripId]: Number(e.target.value) })}
          className="min-h-11 rounded-md border border-divider bg-calce px-3 text-body font-normal"
        >
          {Array.from({ length: trip.days }, (_, d) => (
            <option key={d} value={d}>
              {t("dayOption", { n: d + 1, stops: trip.dayStops[d] ?? 0 })}
              {d === suggestion.day && !suggestion.far && activityArea ? ` · ${t("sameArea")}` : ""}
            </option>
          ))}
        </select>
      </label>
      {suggestion.far && (
        <p role="note" className="rounded-lg border border-card-edge bg-calce-raised p-4 text-body-s">
          {t("farTrip", { areas: tripAreas.join(", "), area: activityArea ? (areaNames[activityArea] ?? activityArea) : "" })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-body-s text-danger">
          {t(`errors.${error}`)}
        </p>
      )}
      <div>
        <Button type="submit" variant="primary" disabled={pending} aria-busy={pending}>
          {t("addHere")}
        </Button>
      </div>
    </form>
  );
}
