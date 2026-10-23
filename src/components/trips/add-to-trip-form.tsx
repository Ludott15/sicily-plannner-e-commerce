"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { clearAnnouncement, queueAnnouncement } from "@/lib/announce";
import { Link } from "@/lib/i18n/navigation";
import { suggestDay } from "@/lib/trips";
import { proposeStop, type ProposalFormState } from "@/server/groups/proposals-actions";
import { addToTrip } from "@/server/trips/actions";

// "Aggiungi al viaggio" (M5): scelta del viaggio e del giorno. Il giorno proposto è quello
// compatibile per area (suggestDay); se il viaggio è in un'altra zona, lo diciamo prima.
// Viaggio di gruppo (4.2): se chi aggiunge non è il proprietario del gruppo (isGroupOwner false),
// la scelta diventa una proposta al gruppo (proposeStop), che il proprietario accetta o rifiuta.
// Senza gruppo, o se è il proprietario, la tappa si aggiunge subito (addToTrip).
export type PickerTrip = {
  id: string;
  title: string;
  days: number;
  dayAreas: string[][];
  dayStops: number[];
  isGroupOwner?: boolean;
};

const IDLE: ProposalFormState = { status: "idle" };

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
  const tg = useTranslations("Groups");
  const [tripId, setTripId] = useState(trips[0]!.id);
  const trip = trips.find((x) => x.id === tripId)!;
  const suggestion = suggestDay(trip.dayAreas, trip.dayStops, activityArea);
  const [dayByTrip, setDayByTrip] = useState<Record<string, number>>({});
  const day = dayByTrip[tripId] ?? suggestion.day;
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const tripAreas = [...new Set(trip.dayAreas.flat())].map((a) => areaNames[a] ?? a);
  const proposing = trip.isGroupOwner === false;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setSent(false);
    startTransition(async () => {
      if (proposing) {
        const result: ProposalFormState = await proposeStop(IDLE, { itineraryId: tripId, activityId, dayIndex: day });
        if (result.status === "error") setMessage(tg(`proposalErrors.${result.code}`));
        if (result.status === "ok") setSent(true);
        return;
      }
      // Se l'azione riesce il server reindirizza al viaggio, che legge l'annuncio appena montato.
      queueAnnouncement(t("stopAddedAnnouncement", { day: day + 1 }));
      const result = await addToTrip({ locale, itineraryId: tripId, activityId, dayIndex: day });
      if (result?.status === "error") {
        clearAnnouncement();
        setMessage(t(`errors.${result.code}`));
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <label className="flex flex-col gap-2 text-body-s font-semibold">
        {t("pickTrip")}
        <select
          value={tripId}
          onChange={(e) => setTripId(e.target.value)}
          className="min-h-11 w-full rounded-sm border-[1.5px] border-border-control bg-calce-raised px-3 text-body font-normal text-lava"
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
          className="min-h-11 w-full rounded-sm border-[1.5px] border-border-control bg-calce-raised px-3 text-body font-normal text-lava"
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
        <p role="note" className="rounded-lg bg-calce-sunk p-4 text-body-s">
          {t("farTrip", { areas: tripAreas.join(", "), area: activityArea ? (areaNames[activityArea] ?? activityArea) : "" })}
        </p>
      )}
      {proposing && (
        <p role="note" className="rounded-lg bg-calce-sunk p-4 text-body-s">
          {tg("proposeNote")}
        </p>
      )}
      {message && (
        <p role="alert" className="text-body-s text-danger">
          {message}
        </p>
      )}
      {sent && (
        <p role="status" className="text-body-s">
          {tg("proposalSent")}{" "}
          <Link href={`/viaggi/${tripId}`} className="font-semibold underline underline-offset-4">
            {tg("proposalOpenTrip")}
          </Link>
        </p>
      )}
      <div>
        <Button type="submit" variant="primary" className="w-full sm:w-auto" disabled={pending} aria-busy={pending}>
          {proposing ? tg("proposeAction") : t("addHere")}
        </Button>
      </div>
    </form>
  );
}
