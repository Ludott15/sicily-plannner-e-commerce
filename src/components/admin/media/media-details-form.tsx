"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/design";
import type { AdminFormAction } from "@/lib/admin-form";
import { Checkbox, Field, FormError, Select, TextInput } from "../fields";
import { useAdminForm } from "../use-admin-form";

export type MediaFormValues = {
  id: string;
  isSvg: boolean;
  altIt: string | null;
  altEn: string | null;
  sourceType: "own" | "licensed" | "partner" | "illustration";
  author: string | null;
  authorUrl: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string | null;
  modified: boolean;
  heritageAsset: boolean;
  authorizationId: string | null;
};

export type AuthorizationOption = { id: string; label: string; expired: boolean };

// Dati di un'immagine: testo alternativo, tipo, autore e licenza (obbligatori per foto
// proprie, con licenza e dei partner), bene culturale con la sua autorizzazione.
export function MediaDetailsForm({
  action,
  values,
  authorizations,
}: {
  action: AdminFormAction;
  values: MediaFormValues;
  authorizations: AuthorizationOption[];
}) {
  const t = useTranslations("Admin");
  const { state, onSubmit, pending } = useAdminForm(action);
  const [sourceType, setSourceType] = useState(values.sourceType);
  const [heritage, setHeritage] = useState(values.heritageAsset);
  const id = (name: string) => `${name}-${values.id}`;
  const isPhoto = sourceType !== "illustration";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" data-testid={`media-form-${values.id}`}>
      <input type="hidden" name="id" value={values.id} />
      <FormError message={state.status === "error" ? t(`errors.${state.code}`) : null} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("mediaAltIt")} htmlFor={id("altIt")} hint={t("mediaAltHint")}>
          <TextInput id={id("altIt")} name="altIt" defaultValue={values.altIt ?? ""} maxLength={300} />
        </Field>
        <Field label={t("mediaAltEn")} htmlFor={id("altEn")}>
          <TextInput id={id("altEn")} name="altEn" defaultValue={values.altEn ?? ""} maxLength={300} />
        </Field>
        <Field label={t("mediaSourceType")} htmlFor={id("sourceType")}>
          <Select
            id={id("sourceType")}
            name="sourceType"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as MediaFormValues["sourceType"])}
          >
            {(values.isSvg ? (["illustration"] as const) : (["own", "licensed", "partner", "illustration"] as const)).map((s) => (
              <option key={s} value={s}>
                {t(`mediaSource.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
        {isPhoto && (
          <>
            <Field label={t("mediaAuthor")} htmlFor={id("author")}>
              <TextInput id={id("author")} name="author" defaultValue={values.author ?? ""} maxLength={200} required />
            </Field>
            <Field label={t("mediaAuthorUrl")} htmlFor={id("authorUrl")}>
              <TextInput id={id("authorUrl")} name="authorUrl" type="url" defaultValue={values.authorUrl ?? ""} />
            </Field>
            <Field label={t("mediaLicense")} htmlFor={id("license")} hint={t("mediaLicenseHint")}>
              <TextInput id={id("license")} name="license" defaultValue={values.license ?? ""} maxLength={120} required />
            </Field>
            <Field label={t("mediaLicenseUrl")} htmlFor={id("licenseUrl")}>
              <TextInput id={id("licenseUrl")} name="licenseUrl" type="url" defaultValue={values.licenseUrl ?? ""} />
            </Field>
            <Field label={t("mediaSourceUrl")} htmlFor={id("sourceUrl")} hint={t("mediaSourceUrlHint")}>
              <TextInput id={id("sourceUrl")} name="sourceUrl" type="url" defaultValue={values.sourceUrl ?? ""} />
            </Field>
          </>
        )}
      </div>
      {isPhoto && (
        <Checkbox
          label={t("mediaModified")}
          name="modified"
          defaultChecked={values.modified || sourceType === "licensed"}
          disabled={sourceType === "licensed"}
        />
      )}
      {sourceType === "licensed" && <input type="hidden" name="modified" value="on" />}
      <Checkbox
        label={t("mediaHeritage")}
        name="heritageAsset"
        checked={heritage}
        onChange={(e) => setHeritage(e.target.checked)}
      />
      {heritage && (
        <Field label={t("mediaAuthorization")} htmlFor={id("authorizationId")} hint={t("mediaAuthorizationHint")}>
          <Select id={id("authorizationId")} name="authorizationId" defaultValue={values.authorizationId ?? ""} required>
            <option value="">—</option>
            {authorizations.map((a) => (
              <option key={a.id} value={a.id} disabled={a.expired}>
                {a.label}
                {a.expired ? ` (${t("authorizationExpired")})` : ""}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="flex items-center gap-4">
        <Button type="submit" variant="secondary" disabled={pending}>
          {t("save")}
        </Button>
        {state.status === "saved" && (
          <span role="status" className="text-body-s text-lava-muted">
            {t("saved")}
          </span>
        )}
      </div>
    </form>
  );
}
