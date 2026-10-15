"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ButtonAnchor } from "@/components/design";
import { deleteTrip, duplicateTrip, type TripFormState } from "@/server/trips/actions";
import { ConfirmDialog } from "./confirm-dialog";
import { FormAlert } from "./trip-ui";
import { useTripForm } from "./use-trip-form";

// Azioni del viaggio: stampa, calendario (.ics, solo con la data di partenza), duplica ed elimina
// (con conferma). Tutto è nascosto nella stampa.

const IDLE: TripFormState = { status: "ok" };

export function TripActions({ locale, tripId, startDate }: { locale: string; tripId: string; startDate: string | null }) {
  const t = useTranslations("Trips");
  const hintId = useId();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const duplicate = useTripForm<TripFormState>((_prev, formData) => duplicateTrip(formData), IDLE);
  const remove = useTripForm<TripFormState>((_prev, formData) => deleteTrip(formData), IDLE);

  const duplicateError = duplicate.submitted && duplicate.state.status === "error" ? t(`errors.${duplicate.state.code}`) : null;
  const removeError = remove.submitted && remove.state.status === "error" ? t(`errors.${remove.state.code}`) : null;

  return (
    <div className="is-trip-tools flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => window.print()}>
          {t("print")}
        </Button>
        {startDate ? (
          <ButtonAnchor variant="secondary" href={`/${locale}/viaggi/${tripId}/calendario`} download>
            {t("exportCalendar")}
          </ButtonAnchor>
        ) : (
          <Button variant="secondary" disabled aria-describedby={hintId}>
            {t("exportCalendar")}
          </Button>
        )}
        <form onSubmit={duplicate.submit}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="tripId" value={tripId} />
          <Button type="submit" variant="secondary" disabled={duplicate.pending}>
            {t("duplicate")}
          </Button>
        </form>
        <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
          {t("deleteTrip")}
        </Button>
      </div>
      {!startDate && (
        <p id={hintId} className="text-body-s text-lava-muted">
          {t("calendarNoDate")}
        </p>
      )}
      <FormAlert message={duplicateError} />

      <ConfirmDialog open={deleteOpen} title={t("deleteTitle")} onClose={() => setDeleteOpen(false)}>
        <form onSubmit={remove.submit} className="flex flex-col gap-4" aria-busy={remove.pending}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="tripId" value={tripId} />
          <p className="text-body">{t("deleteBody")}</p>
          <FormAlert message={removeError} />
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={remove.pending}>
              {t("deleteConfirm")}
            </Button>
          </div>
        </form>
      </ConfirmDialog>
    </div>
  );
}
