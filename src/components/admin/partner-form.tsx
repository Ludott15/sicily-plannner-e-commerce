"use client";

import { useTranslations } from "next-intl";
import { buttonClass } from "@/components/design";
import type { AdminFormAction } from "@/lib/admin-form";
import { PARTNER_ID_ENV_NAMES } from "@/lib/partner-env-names";
import { Checkbox, Field, FormError, FormNotice, Select, TextInput } from "./fields";
import { useAdminForm } from "./use-admin-form";

// Partner affiliato (affiliate_partners): modifica di nome, verticali, template, host, parametro
// del subid, nome della variabile d'ambiente e stato. Il valore dell'ID non arriva mai al form:
// si vede solo se la variabile è impostata.

export type PartnerFormValues = {
  partner: string;
  name: string;
  verticals: string[];
  searchUrlTemplate: string | null;
  allowedHosts: string[];
  subidParam: string | null;
  partnerIdEnv: string | null;
  isActive: boolean;
  envConfigured: boolean;
};

const VERTICAL_OPTIONS = ["lodging", "car", "activity", "flight"] as const;

export function PartnerForm({
  action,
  locale,
  values,
}: {
  action: AdminFormAction;
  locale: string;
  values: PartnerFormValues;
}) {
  const t = useTranslations("Admin");
  const tAff = useTranslations("Affiliates");
  const save = useAdminForm(action);
  const id = (field: string) => `${values.partner}-${field}`;

  return (
    <form onSubmit={save.onSubmit} className="flex flex-col gap-4 rounded-lg border border-card-edge bg-calce-raised p-6">
      <input type="hidden" name="partner" value={values.partner} />
      <input type="hidden" name="locale" value={locale} />
      <FormError message={save.state.status === "error" ? t(`errors.${save.state.code}`) : null} />
      <FormNotice message={save.state.status === "saved" ? t("partnerSaved") : null} />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("partnerName")} htmlFor={id("name")}>
          <TextInput id={id("name")} name="name" defaultValue={values.name} minLength={2} maxLength={60} required />
        </Field>
        <Field
          label={t("partnerEnvName")}
          htmlFor={id("env")}
          hint={values.envConfigured ? t("partnerEnvSet") : t("partnerEnvUnset")}
        >
          <Select id={id("env")} name="partnerIdEnv" defaultValue={values.partnerIdEnv ?? ""}>
            <option value="">{t("partnerEnvNone")}</option>
            {PARTNER_ID_ENV_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-body-s font-semibold">{t("partnerVerticals")}</legend>
        <div className="flex flex-wrap gap-x-6">
          {VERTICAL_OPTIONS.map((v) => (
            <Checkbox
              key={v}
              name="verticals"
              value={v}
              label={tAff(`verticalName.${v}`)}
              defaultChecked={values.verticals.includes(v)}
            />
          ))}
        </div>
      </fieldset>

      <Field label={t("partnerTemplate")} htmlFor={id("template")} hint={t("partnerTemplateHint")}>
        <TextInput
          id={id("template")}
          name="searchUrlTemplate"
          defaultValue={values.searchUrlTemplate ?? ""}
          maxLength={1000}
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("partnerHosts")} htmlFor={id("hosts")} hint={t("partnerHostsHint")}>
          <TextInput id={id("hosts")} name="allowedHosts" defaultValue={values.allowedHosts.join(", ")} />
        </Field>
        <Field label={t("partnerSubid")} htmlFor={id("subid")}>
          <TextInput id={id("subid")} name="subidParam" defaultValue={values.subidParam ?? ""} maxLength={20} />
        </Field>
      </div>

      <Checkbox label={t("partnerActive")} name="isActive" defaultChecked={values.isActive} />

      <div>
        <button type="submit" className={buttonClass("primary")} disabled={save.pending}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}
