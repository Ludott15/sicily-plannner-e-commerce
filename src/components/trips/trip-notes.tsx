"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { TIME_SLOTS, type TimeSlot } from "@/lib/itinerary-checks";
import { saveDayNote, saveStopNote, type TripFormState } from "@/server/trips/actions";
import { FieldLabel, FormAlert, SavedNote, controlClass, textareaClass } from "./trip-ui";
import { useTripForm } from "./use-trip-form";

// Note del builder: la nota del giorno e la nota (con la fascia oraria) di una tappa. Ogni form
// parte da onSubmit con startTransition (useTripForm). Nella stampa il testo resta visibile.

const DAY_NOTE_MAX = 500;
const STOP_NOTE_MAX = 280;
const IDLE: TripFormState = { status: "ok" };

export function DayNoteForm({ tripId, dayIndex, note }: { tripId: string; dayIndex: number; note: string }) {
  const t = useTranslations("Trips");
  const id = useId();
  const form = useTripForm<TripFormState>(saveDayNote, IDLE);
  const saved = form.submitted && !form.pending && form.state.status === "ok";

  return (
    <div className="flex flex-col gap-2">
      <p className="is-trip-print-note text-body">{note}</p>
      <form onSubmit={form.submit} className="is-trip-tools flex flex-col gap-3" aria-busy={form.pending}>
        <input type="hidden" name="tripId" value={tripId} />
        <input type="hidden" name="dayIndex" value={dayIndex} />
        <FieldLabel htmlFor={`${id}-note`}>{t("dayNoteLabel")}</FieldLabel>
        <textarea id={`${id}-note`} name="note" rows={3} maxLength={DAY_NOTE_MAX} defaultValue={note} className={textareaClass} />
        <div>
          <Button type="submit" variant="secondary" disabled={form.pending}>
            {t("dayNoteSave")}
          </Button>
        </div>
        <FormAlert message={form.submitted && form.state.status === "error" ? t(`errors.${form.state.code}`) : null} />
        <SavedNote message={saved ? t("dayNoteSaved") : null} />
      </form>
    </div>
  );
}

export function StopNoteForm({ stopId, timeSlot, notes }: { stopId: string; timeSlot: TimeSlot | null; notes: string | null }) {
  const t = useTranslations("Trips");
  const id = useId();
  const form = useTripForm<TripFormState>(saveStopNote, IDLE);
  const saved = form.submitted && !form.pending && form.state.status === "ok";

  return (
    <div className="mt-2 flex flex-col gap-2">
      {notes && <p className="is-trip-print-note text-body-s">{notes}</p>}
      <form onSubmit={form.submit} className="is-trip-tools grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end" aria-busy={form.pending}>
        <input type="hidden" name="stopId" value={stopId} />
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={`${id}-slot`}>{t("stopTimeSlot")}</FieldLabel>
          <select id={`${id}-slot`} name="timeSlot" defaultValue={timeSlot ?? ""} className={controlClass}>
            <option value="">{t("timeSlotNone")}</option>
            {TIME_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {t(`timeSlot.${slot}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={`${id}-note`}>{t("stopNote")}</FieldLabel>
          <textarea id={`${id}-note`} name="note" rows={2} maxLength={STOP_NOTE_MAX} defaultValue={notes ?? ""} className={textareaClass} />
        </div>
        <Button type="submit" variant="secondary" disabled={form.pending}>
          {t("stopSave")}
        </Button>
        <div className="flex flex-col gap-2 sm:col-span-3">
          <FormAlert message={form.submitted && form.state.status === "error" ? t(`errors.${form.state.code}`) : null} />
          <SavedNote message={saved ? t("stopNoteSaved") : null} />
        </div>
      </form>
    </div>
  );
}
