"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ButtonLink } from "@/components/design";
import { ActionMenu, type ActionMenuItem } from "@/components/layout/action-menu";
import { Dialog } from "@/components/ui/dialog";
import type { Pace } from "@/lib/itinerary-checks";
import { deleteTrip, duplicateTrip, type TripFormState } from "@/server/trips/actions";
import { ConfirmDialog } from "./confirm-dialog";
import { TripSettings } from "./trip-settings";
import { TripShare } from "./trip-share";
import { FormAlert } from "./trip-ui";
import { useTripForm } from "./use-trip-form";

// Azioni del viaggio nell'intestazione (brief 6.1): un'azione primaria contestuale ("Imposta le date" se
// mancano, altrimenti "Aggiungi attività") e il menu ⋯ con stampa, calendario, duplica, link pubblico,
// impostazioni ed elimina. Link pubblico, impostazioni ed eliminazione si aprono in dialog. Tutto è
// nascosto nella stampa. Il calendario è disattivato senza data di partenza, con la spiegazione nel
// dialog delle impostazioni.

const IDLE: TripFormState = { status: "ok" };

export type TripActionsProps = {
  locale: string;
  tripId: string;
  title: string;
  startDate: string | null;
  travelers: number | null;
  pace: Pace;
  sharedSince: string | null;
};

export function TripActions({ locale, tripId, title, startDate, travelers, pace, sharedSince }: TripActionsProps) {
  const t = useTranslations("Trips");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEpoch, setShareEpoch] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const duplicateForm = useRef<HTMLFormElement>(null);
  const duplicate = useTripForm<TripFormState>((_prev, formData) => duplicateTrip(formData), IDLE);
  const remove = useTripForm<TripFormState>((_prev, formData) => deleteTrip(formData), IDLE);

  const duplicateError = duplicate.submitted && duplicate.state.status === "error" ? t(`errors.${duplicate.state.code}`) : null;
  const removeError = remove.submitted && remove.state.status === "error" ? t(`errors.${remove.state.code}`) : null;

  const items: ActionMenuItem[] = [
    { kind: "button", label: t("print"), icon: "printer", onSelect: () => window.print() },
    {
      kind: "button",
      label: t("exportCalendar"),
      icon: "calendar",
      disabled: !startDate,
      // Il calendario è un download (.ics) dalla route del viaggio: un'ancora con download lo scarica senza lasciare la pagina.
      onSelect: () => {
        const link = document.createElement("a");
        link.href = `/${locale}/viaggi/${tripId}/calendario`;
        link.download = "";
        link.click();
      },
    },
    { kind: "button", label: t("duplicate"), icon: "copy", disabled: duplicate.pending, onSelect: () => duplicateForm.current?.requestSubmit() },
    { kind: "button", label: t("shareHeading"), icon: "link", onSelect: () => setShareOpen(true) },
    { kind: "button", label: t("settingsTitle"), icon: "settings", onSelect: () => setSettingsOpen(true) },
    { kind: "separator" },
    { kind: "button", label: t("deleteTrip"), icon: "trash", danger: true, onSelect: () => setDeleteOpen(true) },
  ];

  return (
    <>
      <div className="is-trip-tools flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          {startDate ? (
            <ButtonLink variant="primary" href="/attivita">
              {t("v2.addActivity")}
            </ButtonLink>
          ) : (
            <Button variant="primary" onClick={() => setSettingsOpen(true)}>
              {t("v2.setDates")}
            </Button>
          )}
          <ActionMenu variant="more" label={t("v2.actionsLabel")} items={items} />
        </div>
        <FormAlert message={duplicateError} />
      </div>

      <form ref={duplicateForm} onSubmit={duplicate.submit} className="hidden">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="tripId" value={tripId} />
      </form>

      <Dialog
        open={settingsOpen}
        title={t("settingsTitle")}
        description={startDate ? undefined : t("calendarNoDate")}
        onClose={() => setSettingsOpen(false)}
      >
        <TripSettings tripId={tripId} title={title} startDate={startDate} travelers={travelers} pace={pace} />
      </Dialog>

      <Dialog open={shareOpen} title={t("shareHeading")} onClose={() => setShareOpen(false)}>
        <TripShare
          key={shareEpoch}
          tripId={tripId}
          locale={locale}
          title={title}
          activeSince={sharedSince}
          onRevoked={() => setShareEpoch((n) => n + 1)}
        />
      </Dialog>

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
    </>
  );
}
