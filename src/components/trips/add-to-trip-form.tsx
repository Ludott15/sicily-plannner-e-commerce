"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, Select } from "@/components/design";
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
  const tripFieldId = useId();
  const dayFieldId = useId();
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
      <div className="flex flex-col gap-2">
        <label htmlFor={tripFieldId} className="text-body-s font-semibold">
          {t("pickTrip")}
        </label>
        <Select
          id={tripFieldId}
          label={t("pickTrip")}
          value={tripId}
          onValueChange={setTripId}
          options={trips.map((x) => ({ value: x.id, label: x.title }))}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={dayFieldId} className="text-body-s font-semibold">
          {t("pickDay")}
        </label>
        <Select
          id={dayFieldId}
          label={t("pickDay")}
          value={String(day)}
          onValueChange={(value) => setDayByTrip({ ...dayByTrip, [tripId]: Number(value) })}
          options={Array.from({ length: trip.days }, (_, d) => ({
            value: String(d),
            label: `${t("dayOption", { n: d + 1, stops: trip.dayStops[d] ?? 0 })}${
              d === suggestion.day && !suggestion.far && activityArea ? ` · ${t("sameArea")}` : ""
            }`,
          }))}
        />
      </div>
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
