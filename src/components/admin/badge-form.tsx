"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buttonClass } from "@/components/design";
import type { AdminFormAction } from "@/lib/admin-form";
import { PROVINCES } from "@/lib/provinces";
import { Field, FormError, FormNotice, Select, TextArea, TextInput } from "./fields";
import { useAdminForm } from "./use-admin-form";

// Badge (passo 5.2): creazione e modifica. La chiave si sceglie alla creazione e poi non cambia.
// Il tipo di criterio decide quali campi del criterio compaiono; il server ignora gli altri.

export const BADGE_CRITERIA_TYPES = [
  "itineraries_completed",
  "check_ins_in_province",
  "provinces_checked_in",
  "interest_activities_completed",
  "group_size",
  "points_total",
] as const;

export type BadgeCriteriaType = (typeof BADGE_CRITERIA_TYPES)[number];

function isCriteriaType(value: string): value is BadgeCriteriaType {
  return (BADGE_CRITERIA_TYPES as readonly string[]).includes(value);
}

export type BadgeFormValues = {
  key: string;
  nameIt: string;
  nameEn: string;
  description: string;
  criteriaType: BadgeCriteriaType;
  min: number;
  province: string;
  interest: string;
};

export type BadgeFormInterest = { key: string; label: string };

// Limiti della soglia per tipo, specchio di badgeCriteriaSchema in src/lib/badges.ts.
const MIN_BOUNDS: Record<BadgeCriteriaType, { min: number; max: number }> = {
  itineraries_completed: { min: 1, max: 999999 },
  check_ins_in_province: { min: 1, max: 999999 },
  provinces_checked_in: { min: 1, max: 9 },
  interest_activities_completed: { min: 1, max: 999999 },
  group_size: { min: 2, max: 30 },
  points_total: { min: 1, max: 999999 },
};

export function BadgeForm({
  action,
  interests,
  values,
}: {
  action: AdminFormAction;
  interests: readonly BadgeFormInterest[];
  values?: BadgeFormValues;
}) {
  const t = useTranslations("AdminBadges");
  const save = useAdminForm(action);
  const isNew = values === undefined;
  const base: BadgeFormValues = values ?? {
    key: "",
    nameIt: "",
    nameEn: "",
    description: "",
    criteriaType: "itineraries_completed",
    min: 1,
    province: "CT",
    interest: interests[0]?.key ?? "",
  };
  const [criteriaType, setCriteriaType] = useState<BadgeCriteriaType>(base.criteriaType);
  const id = (field: string) => `badge-${base.key || "nuovo"}-${field}`;

  const errorText =
    save.state.status === "error"
      ? save.state.code === "slug_taken"
        ? t("errorKeyTaken")
        : save.state.code === "invalid"
          ? t("errorInvalid")
          : t("errorFailed")
      : null;

  function onCriteriaTypeChange(next: string) {
    if (isCriteriaType(next)) setCriteriaType(next);
  }

  return (
    <form onSubmit={save.onSubmit} className="flex flex-col gap-4 rounded-lg border border-card-edge bg-calce-raised p-6">
      <FormError message={errorText} />
      <FormNotice message={save.state.status === "saved" ? t("saved") : null} />

      {isNew ? (
        <Field label={t("fieldKey")} htmlFor={id("key")} hint={t("fieldKeyHint")}>
          <TextInput id={id("key")} name="key" required maxLength={40} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        </Field>
      ) : (
        <>
          <input type="hidden" name="key" value={base.key} />
          <p className="text-body-s">
            <span className="font-semibold">{t("fieldKey")}: </span>
            <span>{base.key}</span>
          </p>
        </>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("fieldNameIt")} htmlFor={id("name-it")} hint={t("fieldNameHint")}>
          <TextInput id={id("name-it")} name="nameIt" defaultValue={base.nameIt} required maxLength={40} />
        </Field>
        <Field label={t("fieldNameEn")} htmlFor={id("name-en")} hint={t("fieldNameHint")}>
          <TextInput id={id("name-en")} name="nameEn" defaultValue={base.nameEn} required maxLength={40} />
        </Field>
      </div>

      <Field label={t("fieldDescription")} htmlFor={id("description")}>
        <TextArea id={id("description")} name="description" defaultValue={base.description} maxLength={300} />
      </Field>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label={t("fieldCriteriaType")} htmlFor={id("criteria-type")}>
          <Select id={id("criteria-type")} name="criteriaType" value={criteriaType} onValueChange={onCriteriaTypeChange}>
            {BADGE_CRITERIA_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`criterionTypes.${type}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("fieldMin")} htmlFor={id("min")}>
          <TextInput
            id={id("min")}
            name="min"
            type="number"
            inputMode="numeric"
            min={MIN_BOUNDS[criteriaType].min}
            max={MIN_BOUNDS[criteriaType].max}
            step={1}
            defaultValue={base.min}
            required
          />
        </Field>
        {criteriaType === "check_ins_in_province" && (
          <Field label={t("fieldProvince")} htmlFor={id("province")}>
            <Select id={id("province")} name="province" defaultValue={base.province}>
              {Object.entries(PROVINCES).map(([code, name]) => (
                <option key={code} value={code}>
                  {`${code} · ${name}`}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {criteriaType === "interest_activities_completed" && (
          <Field
            label={t("fieldInterest")}
            htmlFor={id("interest")}
            hint={interests.length === 0 ? t("fieldInterestNone") : undefined}
          >
            <Select id={id("interest")} name="interest" defaultValue={base.interest}>
              {interests.map((interest) => (
                <option key={interest.key} value={interest.key}>
                  {interest.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div>
        <button type="submit" className={buttonClass("primary")} disabled={save.pending}>
          {save.pending ? t("saving") : isNew ? t("create") : t("save")}
        </button>
      </div>
    </form>
  );
}
