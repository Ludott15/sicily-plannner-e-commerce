"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { useAdminForm } from "./use-admin-form";
import type { AdminFormAction } from "@/lib/admin-form";
import { Checkbox, Field, FormError, Select, TextArea, TextInput } from "./fields";

// Form di un'attività del catalogo. La regola "niente attivazione senza interessi" la
// verificano l'azione server e il database; qui la si spiega accanto ai campi.

export type ActivityFormValues = {
  id?: string;
  title: string;
  slug: string;
  placeId: string;
  description: string | null;
  durationMin: number | null;
  priceFromEur: string | null;
  requiresCar: boolean;
  accessible: boolean;
  seasonMonths: number[];
  partner: string;
  partnerProductId: string | null;
  affiliateUrl: string | null;
  rating: string | null;
  isActive: boolean;
  tags: { key: string; strength: number }[];
};

const PARTNERS = ["internal", "getyourguide", "viator", "travelpayouts", "car_rental"];

export function ActivityForm({
  action,
  locale,
  values,
  places,
  interests,
}: {
  action: AdminFormAction;
  locale: string;
  values: ActivityFormValues;
  places: { id: string; name: string }[];
  interests: { key: string; label: string }[];
}) {
  const t = useTranslations("Admin");
  const { state, onSubmit, pending } = useAdminForm(action);
  const months = t.raw("months") as string[];
  const strength = new Map(values.tags.map((tag) => [tag.key, tag.strength]));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={values.id ?? ""} />
      <input type="hidden" name="locale" value={locale} />
      <FormError message={state.status === "error" ? t(`errors.${state.code}`) : null} />

      <div className="grid gap-6 md:grid-cols-2">
        <Field label={t("fieldTitle")} htmlFor="title">
          <TextInput id="title" name="title" defaultValue={values.title} required />
        </Field>
        <Field label={t("fieldSlug")} hint={t("fieldSlugHint")} htmlFor="slug">
          <TextInput id="slug" name="slug" defaultValue={values.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        </Field>
        <Field label={t("fieldPlace")} htmlFor="placeId">
          <Select id="placeId" name="placeId" defaultValue={values.placeId} required>
            <option value="" disabled>
              —
            </option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("fieldDuration")} htmlFor="durationMin">
          <TextInput id="durationMin" name="durationMin" type="number" min={1} defaultValue={values.durationMin ?? ""} required />
        </Field>
      </div>

      <Field label={t("fieldDescription")} htmlFor="description">
        <TextArea id="description" name="description" defaultValue={values.description ?? ""} />
      </Field>

      <div className="grid gap-6 md:grid-cols-3">
        <Field label={t("fieldPrice")} htmlFor="priceFromEur">
          <TextInput id="priceFromEur" name="priceFromEur" inputMode="decimal" defaultValue={values.priceFromEur ?? ""} />
        </Field>
        <Field label={t("fieldRating")} htmlFor="rating">
          <TextInput id="rating" name="rating" inputMode="decimal" defaultValue={values.rating ?? ""} />
        </Field>
        <div className="flex flex-col justify-end">
          <Checkbox label={t("fieldRequiresCar")} name="requiresCar" defaultChecked={values.requiresCar} />
          <Checkbox label={t("fieldAccessible")} name="accessible" defaultChecked={values.accessible} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-body-s font-semibold">{t("fieldSeason")}</legend>
        <div className="grid grid-cols-4 gap-x-4 sm:grid-cols-6 md:grid-cols-12">
          {months.map((label, i) => (
            <Checkbox
              key={label}
              label={label}
              name="seasonMonths"
              value={String(i + 1)}
              defaultChecked={values.seasonMonths.includes(i + 1)}
            />
          ))}
        </div>
      </fieldset>

      <div className="grid gap-6 md:grid-cols-3">
        <Field label={t("fieldPartner")} htmlFor="partner">
          <Select id="partner" name="partner" defaultValue={values.partner}>
            {PARTNERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("fieldPartnerProduct")} htmlFor="partnerProductId">
          <TextInput id="partnerProductId" name="partnerProductId" defaultValue={values.partnerProductId ?? ""} />
        </Field>
        <Field label={t("fieldAffiliateUrl")} htmlFor="affiliateUrl">
          <TextInput id="affiliateUrl" name="affiliateUrl" type="url" defaultValue={values.affiliateUrl ?? ""} />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-body-s font-semibold">{t("fieldTags")}</legend>
        <p className="text-caption text-lava-muted">{t("fieldTagsHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {interests.map((interest) => (
            <Field key={interest.key} label={interest.label} htmlFor={`tag_${interest.key}`}>
              <Select id={`tag_${interest.key}`} name={`tag_${interest.key}`} defaultValue={String(strength.get(interest.key) ?? 0)}>
                <option value="0">{t("strengthNone")}</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </Select>
            </Field>
          ))}
        </div>
      </fieldset>

      <Checkbox label={t("fieldActive")} name="isActive" defaultChecked={values.isActive} />

      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
