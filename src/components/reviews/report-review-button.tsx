"use client";

import { startTransition, useActionState, useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { reportReviewAction } from "@/server/gamification/actions";

// Segnalazione di una recensione (utenti registrati). Il motivo è obbligatorio; l'invio parte
// da onSubmit con startTransition, come gli altri form con azione server.

export const REPORT_REASONS = ["spam", "offensive", "off_topic", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export function ReportReviewButton({ reviewId }: { reviewId: string }) {
  const t = useTranslations("Reviews");
  const ids = { panel: useId(), title: useId(), messages: useId() };
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [state, dispatch, pending] = useActionState(reportReviewAction, { status: "idle" });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || reason === null) return;
    startTransition(() => dispatch({ reviewId, reason }));
  }

  if (state.status === "reported") {
    return (
      <p role="status" className="text-body-s text-lava-muted">
        {t("reported")}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={ids.panel}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 items-center rounded-sm px-1 text-body-s font-semibold text-lava underline underline-offset-4 hover:text-lava-muted"
      >
        {t("report")}
      </button>
      {open && (
        <form
          id={ids.panel}
          onSubmit={onSubmit}
          aria-labelledby={ids.title}
          className="flex w-full flex-col gap-3 rounded-sm border-[1.5px] border-border-control bg-calce p-4"
        >
          <fieldset className="flex flex-col gap-2">
            <legend id={ids.title} className="mb-1 text-body-s font-semibold">
              {t("reportTitle")}
            </legend>
            {REPORT_REASONS.map((value) => (
              <label key={value} className="flex min-h-11 items-center gap-3 text-body">
                <input
                  type="radio"
                  name={`reason-${reviewId}`}
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value)}
                  className="size-5 accent-lava"
                />
                {t(`reasons.${value}`)}
              </label>
            ))}
          </fieldset>
          {state.status === "error" && (
            <p id={ids.messages} role="alert" className="text-body-s text-danger">
              {t(`errors.${state.code}`)}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" size="sm" disabled={pending || reason === null}>
              {t("reportSend")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t("reportCancel")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
