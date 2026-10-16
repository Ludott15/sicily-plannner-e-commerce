"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { Field, FormError, FormNotice, TextArea } from "./fields";
import { useEditorialAction, type EditorialAction } from "./use-editorial-action";

// Descrizione di un'area in italiano e inglese. Vuota vuol dire "nessuna descrizione": la pagina
// dell'area non mostra la sezione, senza inventare un testo.

export function AreaDescriptionForm({
  action,
  areaId,
  descriptionIt,
  descriptionEn,
}: {
  action: EditorialAction;
  areaId: string;
  descriptionIt: string | null;
  descriptionEn: string | null;
}) {
  const t = useTranslations("Admin");
  const { state, onSubmit, pending } = useEditorialAction(action);
  const errorMessage =
    state.status === "error"
      ? t.has(`areas.errors.${state.code}`)
        ? t(`areas.errors.${state.code}`)
        : t("areas.errors.failed")
      : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-busy={pending}>
      <input type="hidden" name="areaId" value={areaId} />
      <FormError message={errorMessage} />
      <FormNotice message={state.status === "saved" ? t("areas.saved") : null} />
      <div className="grid gap-6 md:grid-cols-2">
        <Field label={t("areas.descriptionIt")} hint={t("areas.descriptionHint")} htmlFor={`description_it_${areaId}`}>
          <TextArea id={`description_it_${areaId}`} name="descriptionIt" defaultValue={descriptionIt ?? ""} />
        </Field>
        <Field label={t("areas.descriptionEn")} htmlFor={`description_en_${areaId}`}>
          <TextArea id={`description_en_${areaId}`} name="descriptionEn" defaultValue={descriptionEn ?? ""} />
        </Field>
      </div>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? t("areas.saving") : t("areas.save")}
        </Button>
      </div>
    </form>
  );
}
