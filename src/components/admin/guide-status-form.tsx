"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { FormError, FormNotice } from "./fields";
import { useEditorialAction, type EditorialAction } from "./use-editorial-action";

// Pubblicazione di una guida: pubblica, ritira o elimina. Ogni azione chiede conferma in due passi
// (il primo clic mostra il testo di conferma), perché pubblicare rende la guida visibile a tutti e
// eliminare non si recupera.

export type GuideStatusIntent = "publish" | "unpublish" | "delete";

export function GuideStatusForm({
  action,
  guideId,
  intent,
}: {
  action: EditorialAction;
  guideId: string;
  intent: GuideStatusIntent;
}) {
  const t = useTranslations("Admin");
  const [confirming, setConfirming] = useState(false);
  const { state, onSubmit, pending } = useEditorialAction(action);
  const isDanger = intent === "delete";
  const errorMessage =
    state.status === "error"
      ? t.has(`guides.errors.${state.code}`)
        ? t(`guides.errors.${state.code}`)
        : t("guides.errors.failed")
      : null;

  return (
    <div className="flex flex-col gap-3">
      <FormError message={errorMessage} />
      <FormNotice message={state.status === "saved" ? t(`guides.status.${intent}Done`) : null} />
      {!confirming ? (
        <div>
          <Button variant={isDanger ? "secondary" : "primary"} onClick={() => setConfirming(true)}>
            {t(`guides.status.${intent}`)}
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-sm border-[1.5px] border-border-control bg-calce-raised p-4">
          <input type="hidden" name="id" value={guideId} />
          <p className="text-body">{t(`guides.status.${intent}Confirm`)}</p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" disabled={pending}>
              {t("guides.status.yes")}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              {t("guides.status.cancel")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
