"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import type { AdminFormAction } from "@/lib/admin-form";
import { Field, FormError, TextArea, TextInput } from "../fields";
import { useAdminForm } from "../use-admin-form";

export type AuthorizationValues = {
  id?: string;
  authority: string;
  reference: string;
  issuedOn: string;
  validUntil: string;
  scope: string;
  documentUrl: string | null;
};

// Autorizzazione di un ente pubblico alla riproduzione di beni culturali in sua consegna
// (artt. 107-108 del Codice dei beni culturali): una per atto, collegabile a più immagini.
export function AuthorizationForm({
  action,
  remove,
  values,
}: {
  action: AdminFormAction;
  remove?: AdminFormAction;
  values: AuthorizationValues;
}) {
  const t = useTranslations("Admin");
  const save = useAdminForm(action);
  const del = useAdminForm(remove ?? action);
  const key = values.id ?? "nuova";
  const state = save.state.status === "error" ? save.state : del.state;

  return (
    <div className="flex flex-col gap-3 border-b border-divider pb-6">
      <form onSubmit={save.onSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={values.id ?? ""} />
        <FormError message={state.status === "error" ? t(`errors.${state.code}`) : null} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("authorizationAuthority")} htmlFor={`authority-${key}`}>
            <TextInput id={`authority-${key}`} name="authority" defaultValue={values.authority} required maxLength={200} />
          </Field>
          <Field label={t("authorizationReference")} htmlFor={`reference-${key}`}>
            <TextInput id={`reference-${key}`} name="reference" defaultValue={values.reference} required maxLength={200} />
          </Field>
          <Field label={t("authorizationIssuedOn")} htmlFor={`issued-${key}`}>
            <TextInput id={`issued-${key}`} name="issuedOn" type="date" defaultValue={values.issuedOn} required />
          </Field>
          <Field label={t("authorizationValidUntil")} htmlFor={`valid-${key}`}>
            <TextInput id={`valid-${key}`} name="validUntil" type="date" defaultValue={values.validUntil} required />
          </Field>
          <Field label={t("authorizationDocument")} htmlFor={`document-${key}`}>
            <TextInput id={`document-${key}`} name="documentUrl" type="url" defaultValue={values.documentUrl ?? ""} />
          </Field>
        </div>
        <Field label={t("authorizationScope")} htmlFor={`scope-${key}`} hint={t("authorizationScopeHint")}>
          <TextArea id={`scope-${key}`} name="scope" defaultValue={values.scope} required maxLength={1000} />
        </Field>
        <div className="flex items-center gap-4">
          <Button type="submit" variant="secondary" disabled={save.pending}>
            {values.id ? t("save") : t("authorizationAdd")}
          </Button>
          {save.state.status === "saved" && (
            <span role="status" className="text-body-s text-lava-muted">
              {t("saved")}
            </span>
          )}
        </div>
      </form>
      {values.id && remove && (
        <form onSubmit={del.onSubmit}>
          <input type="hidden" name="id" value={values.id} />
          <Button type="submit" variant="ghost" disabled={del.pending}>
            {t("authorizationDelete")}
          </Button>
        </form>
      )}
    </div>
  );
}
