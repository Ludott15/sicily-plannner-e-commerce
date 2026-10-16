"use client";

import { useTranslations } from "next-intl";
import { buttonClass } from "@/components/design";
import type { AdminFormAction } from "@/lib/admin-form";
import type { SupplierFormValues } from "@/lib/shop/form-values";
import { Checkbox, Field, FormError, FormNotice, Select, TextArea, TextInput } from "./fields";
import { useAdminForm } from "./use-admin-form";

// Fornitore (suppliers): chi gestisce magazzino e spedizione. Non si mostra mai nelle pagine pubbliche.
// L'adattatore "api" resta inattivo senza la sua chiave (docs/LANCIO.md).

export function SupplierForm({ action, values }: { action: AdminFormAction; values: SupplierFormValues }) {
  const t = useTranslations("Admin.shop");
  const tAdmin = useTranslations("Admin");
  const save = useAdminForm(action);
  const id = (field: string) => `supplier-${values.id ?? "new"}-${field}`;

  return (
    <form onSubmit={save.onSubmit} className="flex flex-col gap-4 rounded-lg border border-card-edge bg-calce-raised p-6">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <FormError message={save.state.status === "error" ? tAdmin(`errors.${save.state.code}`) : null} />
      <FormNotice message={save.state.status === "saved" ? t("saved") : null} />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("supplierName")} htmlFor={id("name")}>
          <TextInput id={id("name")} name="name" defaultValue={values.name} minLength={2} maxLength={80} required />
        </Field>
        <Field label={t("supplierKind")} htmlFor={id("kind")} hint={t("supplierKindHint")}>
          <Select id={id("kind")} name="kind" defaultValue={values.kind}>
            <option value="manual">{t("kindManual")}</option>
            <option value="api">{t("kindApi")}</option>
          </Select>
        </Field>
        <Field label={t("supplierEmail")} htmlFor={id("email")} hint={t("supplierEmailHint")}>
          <TextInput id={id("email")} name="contactEmail" type="email" defaultValue={values.contactEmail} maxLength={200} required />
        </Field>
        <Field label={t("supplierPortal")} htmlFor={id("portal")}>
          <TextInput id={id("portal")} name="portalUrl" type="url" defaultValue={values.portalUrl ?? ""} maxLength={500} />
        </Field>
        <Field label={t("supplierAdapter")} htmlFor={id("adapter")} hint={t("supplierAdapterHint")}>
          <TextInput id={id("adapter")} name="adapterKey" defaultValue={values.adapterKey ?? ""} maxLength={40} />
        </Field>
      </div>

      <Field label={t("supplierNotes")} htmlFor={id("notes")} hint={t("supplierNotesHint")}>
        <TextArea id={id("notes")} name="notes" defaultValue={values.notes ?? ""} maxLength={2000} />
      </Field>

      <Checkbox label={t("active")} name="isActive" defaultChecked={values.isActive} />

      <div>
        <button type="submit" className={buttonClass("primary")} disabled={save.pending}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}
