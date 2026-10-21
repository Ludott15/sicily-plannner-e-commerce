"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Select } from "@/components/design";
import { Dialog } from "@/components/ui/dialog";
import { TIME_SLOTS, type TimeSlot } from "@/lib/itinerary-checks";
import { saveDayNote, saveStopNote, type TripFormState } from "@/server/trips/actions";
import { FieldLabel, FormAlert, SavedNote, textareaClass } from "./trip-ui";
import { useTripForm } from "./use-trip-form";

// Note del builder (brief 6.1): la nota del giorno sta sotto il titolo del giorno, quella della tappa
// nel menu della tappa. Il testo è sempre visibile (anche in stampa); il modulo si apre in un Dialog,
// così la card resta pulita. Ogni form parte da onSubmit con startTransition (useTripForm).

const DAY_NOTE_MAX = 500;
const STOP_NOTE_MAX = 280;
const IDLE: TripFormState = { status: "ok" };

type DayNoteProps = { tripId: string; dayIndex: number; note: string };

// Nota del giorno: il testo, poi il pulsante che apre il dialog con il modulo.
export function DayNote({ tripId, dayIndex, note }: DayNoteProps) {
  const t = useTranslations("Trips");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-start gap-1">
      {note && <p className="is-trip-print-note text-body text-lava-muted">{note}</p>}
      <div className="is-trip-tools">
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {note ? t("v2.dayNoteEdit") : t("v2.dayNoteAdd")}
        </Button>
      </div>
      <Dialog open={open} title={t("dayNoteLabel")} onClose={() => setOpen(false)}>
        <DayNoteForm tripId={tripId} dayIndex={dayIndex} note={note} />
      </Dialog>
    </div>
  );
}

export function DayNoteForm({ tripId, dayIndex, note }: DayNoteProps) {
  const t = useTranslations("Trips");
  const id = useId();
  const form = useTripForm<TripFormState>(saveDayNote, IDLE);
  const saved = form.submitted && !form.pending && form.state.status === "ok";

  return (
    <form onSubmit={form.submit} className="flex flex-col gap-4" aria-busy={form.pending}>
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="dayIndex" value={dayIndex} />
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${id}-note`}>{t("dayNoteLabel")}</FieldLabel>
        <textarea id={`${id}-note`} name="note" rows={4} maxLength={DAY_NOTE_MAX} defaultValue={note} className={textareaClass} />
      </div>
      <FormAlert message={form.submitted && form.state.status === "error" ? t(`errors.${form.state.code}`) : null} />
      <SavedNote message={saved ? t("dayNoteSaved") : null} />
      <div>
        <Button type="submit" variant="primary" disabled={form.pending}>
          {t("dayNoteSave")}
        </Button>
      </div>
    </form>
  );
}

type StopNoteDialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  stopId: string;
  timeSlot: TimeSlot | null;
  notes: string | null;
};

// Nota e fascia oraria di una tappa, nel dialog aperto dal menu della tappa.
export function StopNoteDialog({ open, title, onClose, stopId, timeSlot, notes }: StopNoteDialogProps) {
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <StopNoteForm stopId={stopId} timeSlot={timeSlot} notes={notes} />
    </Dialog>
  );
}

export function StopNoteForm({ stopId, timeSlot, notes }: { stopId: string; timeSlot: TimeSlot | null; notes: string | null }) {
  const t = useTranslations("Trips");
  const id = useId();
  const form = useTripForm<TripFormState>(saveStopNote, IDLE);
  const saved = form.submitted && !form.pending && form.state.status === "ok";

  return (
    <form onSubmit={form.submit} className="flex flex-col gap-4" aria-busy={form.pending}>
      <input type="hidden" name="stopId" value={stopId} />
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${id}-slot`}>{t("stopTimeSlot")}</FieldLabel>
        <Select
          id={`${id}-slot`}
          label={t("stopTimeSlot")}
          name="timeSlot"
          defaultValue={timeSlot ?? ""}
          options={[
            { value: "", label: t("timeSlotNone") },
            ...TIME_SLOTS.map((slot) => ({ value: slot, label: t(`timeSlot.${slot}`) })),
          ]}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${id}-note`}>{t("stopNote")}</FieldLabel>
        <textarea id={`${id}-note`} name="note" rows={3} maxLength={STOP_NOTE_MAX} defaultValue={notes ?? ""} className={textareaClass} />
      </div>
      <FormAlert message={form.submitted && form.state.status === "error" ? t(`errors.${form.state.code}`) : null} />
      <SavedNote message={saved ? t("stopNoteSaved") : null} />
      <div>
        <Button type="submit" variant="primary" disabled={form.pending}>
          {t("stopSave")}
        </Button>
      </div>
    </form>
  );
}
