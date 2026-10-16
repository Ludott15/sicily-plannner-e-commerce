"use client";

import { useTranslations } from "next-intl";
import { buttonClass } from "@/components/design";
import type { AdminFormAction } from "@/lib/admin-form";
import type { ProducerFormValues, ShopFormOptions } from "@/lib/shop/form-values";
import { Checkbox, Field, FormError, FormNotice, Select, TextArea, TextInput } from "./fields";
import { useAdminForm } from "./use-admin-form";

// Produttore di origine (producers): il marchio con la sua storia e il territorio. Il produttore
// è visibile solo se pubblico e attivo; email, P.IVA e indirizzo restano nell'admin.

export function ProducerForm({
  action,
  values,
  options,
}: {
  action: AdminFormAction;
  values: ProducerFormValues;
  options: Pick<ShopFormOptions, "areas" | "places">;
}) {
  const t = useTranslations("Admin.shop");
  const tAdmin = useTranslations("Admin");
  const save = useAdminForm(action);
  const id = (field: string) => `producer-${values.id ?? "new"}-${field}`;

  return (
    <form onSubmit={save.onSubmit} className="flex flex-col gap-4 rounded-lg border border-card-edge bg-calce-raised p-6">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <FormError message={save.state.status === "error" ? tAdmin(`errors.${save.state.code}`) : null} />
      <FormNotice message={save.state.status === "saved" ? t("saved") : null} />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("producerName")} htmlFor={id("name")}>
          <TextInput id={id("name")} name="name" defaultValue={values.name} minLength={2} maxLength={80} required />
        </Field>
        <Field label={t("producerSlug")} htmlFor={id("slug")} hint={t("slugHint")}>
          <TextInput
            id={id("slug")}
            name="slug"
            defaultValue={values.slug}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={80}
            required
          />
        </Field>
        <Field label={t("producerEmail")} htmlFor={id("email")}>
          <TextInput id={id("email")} name="email" type="email" defaultValue={values.email ?? ""} maxLength={200} />
        </Field>
        <Field label={t("producerVat")} htmlFor={id("vat")}>
          <TextInput id={id("vat")} name="vatNumber" defaultValue={values.vatNumber ?? ""} maxLength={20} />
        </Field>
        <Field label={t("producerAddress")} htmlFor={id("address")}>
          <TextInput id={id("address")} name="address" defaultValue={values.address ?? ""} maxLength={300} />
        </Field>
        <Field label={t("producerArea")} htmlFor={id("area")}>
          <Select id={id("area")} name="areaId" defaultValue={values.areaId ?? ""}>
            <option value="">{t("noneOption")}</option>
            {options.areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("producerPlace")} htmlFor={id("place")}>
          <Select id={id("place")} name="placeId" defaultValue={values.placeId ?? ""}>
            <option value="">{t("noneOption")}</option>
            {options.places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("producerStoryIt")} htmlFor={id("story-it")}>
          <TextArea id={id("story-it")} name="storyIt" defaultValue={values.storyIt ?? ""} maxLength={6000} />
        </Field>
        <Field label={t("producerStoryEn")} htmlFor={id("story-en")}>
          <TextArea id={id("story-en")} name="storyEn" defaultValue={values.storyEn ?? ""} maxLength={6000} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <Checkbox label={t("producerPublic")} name="isPublic" defaultChecked={values.isPublic} />
        <Checkbox label={t("active")} name="isActive" defaultChecked={values.isActive} />
      </div>

      <div>
        <button type="submit" className={buttonClass("primary")} disabled={save.pending}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}
