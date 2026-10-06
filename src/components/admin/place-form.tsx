"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { useAdminForm } from "./use-admin-form";
import type { AdminFormAction } from "@/lib/admin-form";
import { PROVINCES } from "@/lib/provinces";
import { Field, FormError, Select, TextArea, TextInput } from "./fields";

export type PlaceFormValues = {
  id?: string;
  name: string;
  slug: string;
  province: string;
  areaId: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
};

export type AreaOption = { id: string; name: string };

export function PlaceForm({
  action,
  locale,
  values,
  areas,
}: {
  action: AdminFormAction;
  locale: string;
  values: PlaceFormValues;
  areas: AreaOption[];
}) {
  const t = useTranslations("Admin");
  const { state, onSubmit, pending } = useAdminForm(action);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={values.id ?? ""} />
      <input type="hidden" name="locale" value={locale} />
      <FormError message={state.status === "error" ? t(`errors.${state.code}`) : null} />

      <div className="grid gap-6 md:grid-cols-2">
        <Field label={t("fieldName")} htmlFor="name">
          <TextInput id="name" name="name" defaultValue={values.name} required />
        </Field>
        <Field label={t("fieldSlug")} hint={t("fieldSlugHint")} htmlFor="slug">
          <TextInput id="slug" name="slug" defaultValue={values.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        </Field>
        <Field label={t("fieldProvince")} htmlFor="province">
          <Select id="province" name="province" defaultValue={values.province} required>
            {Object.entries(PROVINCES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("fieldArea")} hint={t("fieldAreaHint")} htmlFor="areaId">
          <Select id="areaId" name="areaId" defaultValue={values.areaId ?? ""}>
            <option value="">{t("noArea")}</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("fieldLat")} htmlFor="lat">
            <TextInput id="lat" name="lat" inputMode="decimal" defaultValue={values.lat ?? ""} required />
          </Field>
          <Field label={t("fieldLng")} htmlFor="lng">
            <TextInput id="lng" name="lng" inputMode="decimal" defaultValue={values.lng ?? ""} required />
          </Field>
        </div>
      </div>
      <Field label={t("fieldDescription")} htmlFor="description">
        <TextArea id="description" name="description" defaultValue={values.description ?? ""} />
      </Field>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
