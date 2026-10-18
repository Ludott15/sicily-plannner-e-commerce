"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button, ButtonLink } from "@/components/design";
import {
  PREVIEW_ROW_LIMIT,
  type ConversionFileError,
  type ConversionImportPreview,
  type ConversionImportResult,
  type ConversionIssue,
  type ConversionRowPreview,
} from "@/lib/affiliate-conversions/types";
import { Field, FormError, FormNotice } from "./fields";

// Stato dell'importazione: stessa forma di ConversionImportState (conversions-actions.admin.ts).
// Il tipo è ripetuto qui perché i file *.admin.ts non si importano dai componenti (ESLint).
export type ConversionImportFormState =
  | { status: "idle" }
  | { status: "preview"; preview: ConversionImportPreview }
  | { status: "imported"; result: ConversionImportResult }
  | { status: "error"; code: ConversionFileError; columns?: string[] };

export type ConversionImportFormAction = (
  prev: ConversionImportFormState,
  formData: FormData,
) => Promise<ConversionImportFormState>;

// Importatore CSV delle conversioni. Prima l'anteprima (intent=preview), poi la conferma
// (intent=commit) con lo stesso file: il server ripete parsing, validazione e scrittura.
// Ogni invio è legato alla chiave del file scelto: cambiando file l'anteprima si azzera.
// Come catalog-import.tsx, l'azione parte da onSubmit e non da <form action>, così il file
// scelto resta nel campo anche dopo un errore.
export function ConversionImport({ action }: { action: ConversionImportFormAction }) {
  const t = useTranslations("AdminAffiliates");
  const [state, dispatch, pending] = useActionState(action, { status: "idle" });
  const [fileKey, setFileKey] = useState(0);
  const [runKey, setRunKey] = useState<number | null>(null);
  const visible: ConversionImportFormState = runKey === fileKey ? state : { status: "idle" };

  const preview = visible.status === "preview" ? visible.preview : null;
  const importable = preview ? preview.totals.create + preview.totals.update : 0;
  const errorRows = preview?.rows.filter((row) => row.status === "error") ?? [];
  const createRows = preview?.rows.filter((row) => row.status === "create") ?? [];
  const updateRows = preview?.rows.filter((row) => row.status === "update") ?? [];

  const errorMessage = visible.status === "error" ? t(`import.errors.${visible.code}`, { columns: (visible.columns ?? []).join(", ") }) : null;
  const result = visible.status === "imported" ? visible.result : null;
  const resultMessage = result
    ? t("import.imported", {
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        withoutClick: result.withoutClick,
      })
    : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const intent = submitter instanceof HTMLButtonElement && submitter.value === "commit" ? "commit" : "preview";
    const data = new FormData(event.currentTarget);
    data.set("intent", intent);
    setRunKey(fileKey);
    startTransition(() => dispatch(data));
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={onSubmit} className="flex flex-col gap-6" aria-busy={pending}>
        <FormError message={errorMessage} />
        <FormNotice message={resultMessage} />
        {result && (
          <p className="text-body">
            <ButtonLink href="/admin/affiliati" variant="ghost">
              {t("import.toDashboard")}
            </ButtonLink>
          </p>
        )}

        <Field label={t("import.file")} htmlFor="conversion-import-file" hint={t("import.fileHint")}>
          <input
            id="conversion-import-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            onChange={() => setFileKey((key) => key + 1)}
            className="min-h-11 w-full text-body file:mr-4 file:min-h-11 file:rounded-pill file:border-0 file:bg-calce-sunk file:px-4 file:font-semibold file:text-lava"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" name="intent" value="preview" variant="secondary" disabled={pending}>
            {t("import.preview")}
          </Button>
          {importable > 0 && (
            <Button type="submit" name="intent" value="commit" variant="primary" disabled={pending}>
              {t("import.commitRows", { count: importable })}
            </Button>
          )}
        </div>
        <p aria-live="polite" className="text-body-s text-lava-muted">
          {pending ? t("import.pending") : null}
        </p>
      </form>

      {preview && (
        <section aria-labelledby="conversion-preview-title" className="flex flex-col gap-6 border-t border-divider pt-8">
          <h2 id="conversion-preview-title" className="is-display text-heading-2">
            {t("import.previewTitle")}
          </h2>
          {preview.truncated && (
            <p className="text-body-s text-lava-muted">{t("import.truncated", { limit: PREVIEW_ROW_LIMIT })}</p>
          )}
          <dl className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <div className="flex flex-col gap-1">
              <dt className="text-body-s text-lava-muted">{t("import.totals.create")}</dt>
              <dd className="is-display text-heading-2 tabular-nums">{preview.totals.create}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-body-s text-lava-muted">{t("import.totals.update")}</dt>
              <dd className="is-display text-heading-2 tabular-nums">{preview.totals.update}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-body-s text-lava-muted">{t("import.totals.error")}</dt>
              <dd className="is-display text-heading-2 tabular-nums">{preview.totals.error}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-body-s text-lava-muted">{t("import.totals.withoutClick")}</dt>
              <dd className="is-display text-heading-2 tabular-nums">{preview.totals.withoutClick}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-body-s text-lava-muted">{t("import.totals.possibleDuplicate")}</dt>
              <dd className="is-display text-heading-2 tabular-nums">{preview.totals.possibleDuplicate}</dd>
            </div>
          </dl>

          {preview.rows.length === 0 && <p className="text-body">{t("import.noRows")}</p>}
          {preview.rows.length > 0 && importable === 0 && (
            <p className="text-body font-semibold text-danger">{t("import.noValid")}</p>
          )}

          {errorRows.length > 0 && (
            <ConversionRowsTable id="conversion-errors" title={t("import.sectionErrors")} rows={errorRows} />
          )}
          {createRows.length > 0 && (
            <ConversionRowsTable id="conversion-create" title={t("import.sectionCreate")} rows={createRows} />
          )}
          {updateRows.length > 0 && (
            <ConversionRowsTable id="conversion-update" title={t("import.sectionUpdate")} rows={updateRows} />
          )}
        </section>
      )}
    </div>
  );
}

function ConversionRowsTable({ id, title, rows }: { id: string; title: string; rows: ConversionRowPreview[] }) {
  const t = useTranslations("AdminAffiliates");
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-body-l font-semibold">
        {title}
      </h3>
      <div className="overflow-x-auto">
        <table aria-labelledby={id} className="w-full text-left text-body">
          <thead className="text-body-s text-lava-muted">
            <tr className="border-b border-divider">
              <th scope="col" className="py-2 pr-4 font-semibold">
                {t("import.cols.line")}
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                {t("import.cols.partner")}
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                {t("import.cols.subid")}
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                {t("import.cols.externalId")}
              </th>
              <th scope="col" className="py-2 font-semibold">
                {t("import.cols.details")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.line} className="border-b border-divider align-top">
                <td className="py-3 pr-4 tabular-nums">{row.line}</td>
                <td className="py-3 pr-4">{row.partner || "—"}</td>
                <td className="py-3 pr-4">{row.subid || "—"}</td>
                <td className="py-3 pr-4">{row.externalId || "—"}</td>
                <td className="flex flex-col gap-2 py-3">
                  {row.errors.length > 0 && <IssueList issues={row.errors} />}
                  {row.withoutClick && row.status !== "error" && (
                    <p className="text-body-s font-semibold">{t("import.withoutClick")}</p>
                  )}
                  {row.possibleDuplicate && row.status !== "error" && (
                    <p className="text-body-s font-semibold">{t("import.possibleDuplicate")}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IssueList({ issues }: { issues: ConversionIssue[] }) {
  const t = useTranslations("AdminAffiliates");
  return (
    <ul className="flex flex-col gap-1 text-body-s">
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${issue.column ?? ""}-${index}`}>
          {t(`import.issues.${issue.code}`)}
          {issue.column && <> · {t("import.columnLabel", { column: issue.column })}</>}
          {issue.value !== undefined && <> · {t("import.valueLabel", { value: issue.value })}</>}
        </li>
      ))}
    </ul>
  );
}
