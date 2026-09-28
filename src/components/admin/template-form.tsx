"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { useAdminForm } from "./use-admin-form";
import type { AdminFormAction } from "@/lib/admin-form";
import { Field, FormError, TextInput } from "./fields";

// Dati dell'itinerario pronto: titolo, giorni, titoli dei giorni, slug di pubblicazione.
// Le tappe si gestiscono giorno per giorno sotto il form (pagina di modifica).

export type TemplateFormValues = {
  id?: string;
  title: string;
  slug: string | null;
  days: number;
  dayTitles: string[];
};

export function TemplateForm({ action, locale, values }: { action: AdminFormAction; locale: string; values: TemplateFormValues }) {
  const t = useTranslations("Admin");
  const { state, onSubmit, pending } = useAdminForm(action);
  const [days, setDays] = useState(values.days);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={values.id ?? ""} />
      <input type="hidden" name="locale" value={locale} />
      <FormError message={state.status === "error" ? t(`errors.${state.code}`) : null} />

      <div className="grid gap-6 md:grid-cols-3">
        <Field label={t("fieldTitle")} htmlFor="title">
          <TextInput id="title" name="title" defaultValue={values.title} required />
        </Field>
        <Field label={t("fieldTemplateSlug")} hint={t("fieldTemplateSlugHint")} htmlFor="slug">
          <TextInput id="slug" name="slug" defaultValue={values.slug ?? ""} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        </Field>
        <Field label={t("fieldDays")} htmlFor="days">
          <TextInput
            id="days"
            name="days"
            type="number"
            min={1}
            max={60}
            value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
            required
          />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-body-s font-semibold">{t("fieldDayTitles")}</legend>
        <p className="text-caption text-lava-muted">{t("fieldDayTitleHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: days }, (_, i) => (
            <Field key={i} label={t("fieldDayTitle", { n: i + 1 })} htmlFor={`dayTitle_${i}`}>
              <TextInput id={`dayTitle_${i}`} name={`dayTitle_${i}`} defaultValue={values.dayTitles[i] ?? ""} maxLength={80} />
            </Field>
          ))}
        </div>
      </fieldset>

      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
