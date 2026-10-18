"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { Markdown } from "@/components/editorial/markdown";
import { useRouter } from "@/lib/i18n/navigation";
import { parseMarkdown } from "@/lib/markdown";
import { Field, FormError, FormNotice, Select, TextArea, TextInput } from "./fields";
import { useEditorialAction, type EditorialAction } from "./use-editorial-action";

// Editor di una guida (admin): campi bilingui, copertina e corpo in Markdown con l'anteprima
// accanto al campo. Una guida nuova passa all'indirizzo di modifica appena salvata, così i
// collegamenti si possono scegliere dopo.

export type GuideFormValues = {
  id?: string;
  slug: string;
  titleIt: string;
  titleEn: string;
  summaryIt: string;
  summaryEn: string;
  bodyIt: string;
  bodyEn: string;
  authorName: string;
  coverMediaId: string;
};

export type GuideFormOption = { id: string; label: string };

function BodyField({
  id,
  name,
  label,
  hint,
  required,
  value,
  onChange,
  previewLabel,
  previewEmpty,
}: {
  id: string;
  name: string;
  label: string;
  hint: string;
  required: boolean;
  value: string;
  onChange: Dispatch<SetStateAction<string>>;
  previewLabel: string;
  previewEmpty: string;
}) {
  const blocks = parseMarkdown(value);
  return (
    <div className="grid gap-6 md:grid-cols-2 md:items-start">
      <Field label={label} hint={hint} htmlFor={id}>
        <TextArea
          id={id}
          name={name}
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-72"
        />
      </Field>
      <section aria-label={previewLabel} className="flex flex-col gap-3 rounded-sm border-[1.5px] border-border-control bg-calce-raised p-4">
        <p className="text-body-s font-semibold">{previewLabel}</p>
        {value.trim() ? <Markdown blocks={blocks} /> : <p className="text-body text-lava-muted">{previewEmpty}</p>}
      </section>
    </div>
  );
}

export function GuideForm({
  action,
  values,
  covers,
}: {
  action: EditorialAction;
  values: GuideFormValues;
  covers: GuideFormOption[];
}) {
  const t = useTranslations("Admin");
  const router = useRouter();
  const { state, onSubmit, pending } = useEditorialAction(action);
  const [bodyIt, setBodyIt] = useState(values.bodyIt);
  const [bodyEn, setBodyEn] = useState(values.bodyEn);

  useEffect(() => {
    if (state.status === "saved" && state.id && !values.id) {
      router.replace(`/admin/guide/${state.id}`);
    }
  }, [state, values.id, router]);

  const errorMessage =
    state.status === "error"
      ? t.has(`guides.errors.${state.code}`)
        ? t(`guides.errors.${state.code}`)
        : t("guides.errors.failed")
      : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" aria-busy={pending}>
      <input type="hidden" name="id" value={values.id ?? ""} />
      <FormError message={errorMessage} />
      <FormNotice message={state.status === "saved" ? t("guides.saved") : null} />

      <div className="grid gap-6 md:grid-cols-2">
        <Field label={t("guides.titleIt")} htmlFor="title_it">
          <TextInput id="title_it" name="titleIt" required defaultValue={values.titleIt} />
        </Field>
        <Field label={t("guides.titleEn")} htmlFor="title_en">
          <TextInput id="title_en" name="titleEn" defaultValue={values.titleEn} />
        </Field>
        <Field label={t("guides.slug")} hint={t("guides.slugHint")} htmlFor="slug">
          <TextInput id="slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={values.slug} />
        </Field>
        <Field label={t("guides.authorName")} hint={t("guides.authorHint")} htmlFor="author_name">
          <TextInput id="author_name" name="authorName" required defaultValue={values.authorName} />
        </Field>
        <Field label={t("guides.summaryIt")} htmlFor="summary_it">
          <TextArea id="summary_it" name="summaryIt" defaultValue={values.summaryIt} />
        </Field>
        <Field label={t("guides.summaryEn")} htmlFor="summary_en">
          <TextArea id="summary_en" name="summaryEn" defaultValue={values.summaryEn} />
        </Field>
        <Field label={t("guides.cover")} hint={t("guides.coverHint")} htmlFor="cover_media_id">
          <Select id="cover_media_id" name="coverMediaId" defaultValue={values.coverMediaId}>
            <option value="">{t("guides.noCover")}</option>
            {covers.map((cover) => (
              <option key={cover.id} value={cover.id}>
                {cover.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <BodyField
        id="body_it"
        name="bodyIt"
        label={t("guides.bodyIt")}
        hint={t("guides.bodyHint")}
        required
        value={bodyIt}
        onChange={setBodyIt}
        previewLabel={t("guides.preview")}
        previewEmpty={t("guides.previewEmpty")}
      />
      <BodyField
        id="body_en"
        name="bodyEn"
        label={t("guides.bodyEn")}
        hint={t("guides.bodyHint")}
        required={false}
        value={bodyEn}
        onChange={setBodyEn}
        previewLabel={t("guides.preview")}
        previewEmpty={t("guides.previewEmpty")}
      />

      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? t("guides.saving") : t("guides.save")}
        </Button>
      </div>
    </form>
  );
}
