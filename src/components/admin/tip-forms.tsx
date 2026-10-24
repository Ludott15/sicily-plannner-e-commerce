"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import type { AdminFormAction } from "@/lib/admin-form";
import { Checkbox, DateInput, Field, FormError, Select, TextArea, TextInput } from "./fields";
import { useAdminForm } from "./use-admin-form";

// Form dell'admin dei consigli locali (LocalTip/README.md): un solo fatto concreto, al
// massimo 280 caratteri; firma della redazione o di una persona con relazione e consenso;
// data di verifica reale.

export type TipFormValues = {
  id?: string;
  authorId: string;
  activityId: string | null;
  placeId: string | null;
  body: string;
  authorRelation: string | null;
  verifiedAt: string;
  isActive: boolean;
};

export function TipForm({
  action,
  locale,
  values,
  authors,
  activities,
  places,
}: {
  action: AdminFormAction;
  locale: string;
  values: TipFormValues;
  authors: { id: string; label: string }[];
  activities: { id: string; title: string }[];
  places: { id: string; name: string }[];
}) {
  const t = useTranslations("Admin");
  const { state, onSubmit, pending } = useAdminForm(action);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={values.id ?? ""} />
      <input type="hidden" name="locale" value={locale} />
      <FormError message={state.status === "error" ? t(`errors.${state.code}`) : null} />
      <Field label={t("tipBody")} hint={t("tipBodyHint")} htmlFor="body">
        <TextArea id="body" name="body" maxLength={280} defaultValue={values.body} required />
      </Field>
      <div className="grid gap-6 md:grid-cols-2">
        <Field label={t("tipActivity")} hint={t("tipTargetHint")} htmlFor="activityId">
          <Select id="activityId" name="activityId" defaultValue={values.activityId ?? ""}>
            <option value="">—</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("tipPlace")} htmlFor="placeId">
          <Select id="placeId" name="placeId" defaultValue={values.placeId ?? ""}>
            <option value="">—</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("tipAuthor")} htmlFor="authorId">
          <Select id="authorId" name="authorId" defaultValue={values.authorId} required>
            {authors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("tipRelation")} hint={t("tipRelationHint")} htmlFor="authorRelation">
          <TextInput id="authorRelation" name="authorRelation" defaultValue={values.authorRelation ?? ""} />
        </Field>
        <Field label={t("tipVerifiedAt")} htmlFor="verifiedAt">
          <DateInput id="verifiedAt" name="verifiedAt" defaultValue={values.verifiedAt} required />
        </Field>
      </div>
      <Checkbox label={t("tipActive")} name="isActive" defaultChecked={values.isActive} />
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

export function VerifyTipButton({ action, locale, id }: { action: AdminFormAction; locale: string; id: string }) {
  const t = useTranslations("Admin");
  const { onSubmit, pending } = useAdminForm(action);
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {t("tipVerifiedToday")}
      </Button>
    </form>
  );
}

export type AuthorFormValues = {
  id?: string;
  kind: "editorial" | "person";
  displayName: string;
  bio: string | null;
  photoUrl: string | null;
  consentAt: string | null;
  isActive: boolean;
};

export function AuthorForm({ action, locale, values }: { action: AdminFormAction; locale: string; values: AuthorFormValues }) {
  const t = useTranslations("Admin");
  const { state, onSubmit, pending } = useAdminForm(action);
  const prefix = values.id ?? "nuovo";
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border border-card-edge bg-calce-raised p-6">
      <input type="hidden" name="id" value={values.id ?? ""} />
      <input type="hidden" name="locale" value={locale} />
      <FormError message={state.status === "error" ? t(`errors.${state.code}`) : null} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("authorName")} htmlFor={`${prefix}-name`}>
          <TextInput id={`${prefix}-name`} name="displayName" defaultValue={values.displayName} required />
        </Field>
        <Field label={t("authorKind")} htmlFor={`${prefix}-kind`}>
          <Select id={`${prefix}-kind`} name="kind" defaultValue={values.kind}>
            <option value="editorial">{t("authorEditorial")}</option>
            <option value="person">{t("authorPerson")}</option>
          </Select>
        </Field>
        <Field label={t("authorPhoto")} htmlFor={`${prefix}-photo`}>
          <TextInput id={`${prefix}-photo`} name="photoUrl" type="url" defaultValue={values.photoUrl ?? ""} />
        </Field>
        <Field label={t("authorConsent")} hint={t("authorConsentHint")} htmlFor={`${prefix}-consent`}>
          <DateInput id={`${prefix}-consent`} name="consentAt" defaultValue={values.consentAt ?? ""} />
        </Field>
      </div>
      <Field label={t("authorBio")} htmlFor={`${prefix}-bio`}>
        <TextArea id={`${prefix}-bio`} name="bio" defaultValue={values.bio ?? ""} />
      </Field>
      <Checkbox label={t("authorActive")} name="isActive" defaultChecked={values.isActive} />
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {values.id ? t("save") : t("authorAdd")}
        </Button>
      </div>
    </form>
  );
}
