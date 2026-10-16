"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { PACES, type Pace } from "@/lib/itinerary-checks";
import { updateTripSettings, type TripFormState } from "@/server/trips/actions";
import { FieldLabel, FormAlert, SavedNote, controlClass } from "./trip-ui";
import { useTripForm } from "./use-trip-form";

// Impostazioni del viaggio: nome, data di partenza (vuota la toglie), persone e ritmo. Il titolo della
// sezione è quello del dialog che le contiene (TripActions). Le tappe restano sugli stessi giorni se
// cambia la data.

const IDLE: TripFormState = { status: "ok" };
const TRAVELER_COUNTS = Array.from({ length: 30 }, (_, i) => i + 1);

export function TripSettings({
  tripId,
  title,
  startDate,
  travelers,
  pace,
}: {
  tripId: string;
  title: string;
  startDate: string | null;
  travelers: number | null;
  pace: Pace;
}) {
  const t = useTranslations("Trips");
  const id = useId();
  const form = useTripForm<TripFormState>(updateTripSettings, IDLE);
  const saved = form.submitted && !form.pending && form.state.status === "ok";

  return (
    <form onSubmit={form.submit} className="flex flex-col gap-4" aria-busy={form.pending}>
      <input type="hidden" name="tripId" value={tripId} />
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${id}-name`}>{t("titleField")}</FieldLabel>
        <input id={`${id}-name`} name="title" required maxLength={200} defaultValue={title} className={controlClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${id}-date`}>{t("startDate")}</FieldLabel>
        <input id={`${id}-date`} type="date" name="startDate" defaultValue={startDate ?? ""} className={controlClass} />
        <p className="text-caption text-lava-muted">{t("startDateSettingsHint")}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${id}-travelers`}>{t("travelers")}</FieldLabel>
        <select id={`${id}-travelers`} name="travelers" defaultValue={travelers ? String(travelers) : ""} className={controlClass}>
          <option value="">{t("travelersUnknown")}</option>
          {TRAVELER_COUNTS.map((count) => (
            <option key={count} value={String(count)}>
              {t("travelersOption", { count })}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${id}-pace`}>{t("paceLabel")}</FieldLabel>
        <select id={`${id}-pace`} name="pace" defaultValue={pace} className={controlClass}>
          {PACES.map((p) => (
            <option key={p} value={p}>
              {t(`pace.${p}`)}
            </option>
          ))}
        </select>
      </div>
      <FormAlert message={form.submitted && form.state.status === "error" ? t(`errors.${form.state.code}`) : null} />
      <SavedNote message={saved ? t("settingsSaved") : null} />
      <div>
        <Button type="submit" variant="secondary" disabled={form.pending}>
          {t("settingsSave")}
        </Button>
      </div>
    </form>
  );
}
