"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import type {
  CatalogImportFileError,
  CatalogImportPreview,
  CatalogImportResult,
  ImportIssue,
  ImportRowPreview,
} from "@/lib/catalog-import/types";
import { Field, FormError, FormNotice } from "./fields";

// Stato dell'importazione: stessa forma di CatalogImportState (import-actions.admin.ts).
// Il tipo è ripetuto qui perché i file *.admin.ts non si importano dai componenti (ESLint).
export type CatalogImportFormState =
  | { status: "idle" }
  | { status: "preview"; preview: CatalogImportPreview }
  | { status: "imported"; result: CatalogImportResult }
  | { status: "error"; code: CatalogImportFileError | "failed"; columns?: string[] };

export type CatalogImportFormAction = (
  prev: CatalogImportFormState,
  formData: FormData,
) => Promise<CatalogImportFormState>;

// Importatore CSV del catalogo. Prima l'anteprima (intent=preview), poi la conferma
// (intent=commit) con lo stesso file: il server ripete parsing, validazione e risoluzione.
// Ogni invio è legato alla chiave del file scelto: cambiando file l'anteprima si azzera.
// Come use-admin-form.ts, l'azione parte da onSubmit e non da <form action>, così il file
// scelto resta nel campo anche dopo un errore.
export function CatalogImport({ action }: { action: CatalogImportFormAction }) {
  const t = useTranslations("Admin");
  const [state, dispatch, pending] = useActionState(action, { status: "idle" });
  const [fileKey, setFileKey] = useState(0);
  const [runKey, setRunKey] = useState<number | null>(null);
  const visible: CatalogImportFormState = runKey === fileKey ? state : { status: "idle" };

  const preview = visible.status === "preview" ? visible.preview : null;
  const importable = preview ? preview.totals.create + preview.totals.update : 0;
  const errorRows = preview?.rows.filter((row) => row.status === "error") ?? [];
  const createRows = preview?.rows.filter((row) => row.status === "create") ?? [];
  const updateRows = preview?.rows.filter((row) => row.status === "update") ?? [];

  const errorMessage = visible.status === "error" ? t(`importErrors.${visible.code}`) : null;
  const errorColumns =
    visible.status === "error" && visible.columns && visible.columns.length > 0
      ? t("importErrorColumns", { columns: visible.columns.join(", ") })
      : null;
  const result = visible.status === "imported" ? visible.result : null;

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
        {errorColumns && <p className="text-body-s text-lava-muted">{errorColumns}</p>}
        <FormNotice message={result ? t("importDone", { ...result }) : null} />
        {result && (
          <p className="text-body">
            <Link href="/admin/attivita/da-verificare" className="font-semibold">
              {t("importReviewLink")}
            </Link>
          </p>
        )}

        <Field label={t("importFile")} htmlFor="catalog-import-file" hint={t("importFileHint")}>
          <input
            id="catalog-import-file"
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
            {t("importPreview")}
          </Button>
          {importable > 0 && (
            <Button type="submit" name="intent" value="commit" variant="primary" disabled={pending}>
              {t("importCommit", { count: importable })}
            </Button>
          )}
        </div>
        <p aria-live="polite" className="text-body-s text-lava-muted">
          {pending ? t("importPending") : null}
        </p>
      </form>

      {preview && (
        <section aria-labelledby="import-preview-title" className="flex flex-col gap-6 border-t border-divider pt-8">
          <h2 id="import-preview-title" className="is-display text-heading-2">
            {t("importPreviewTitle")}
          </h2>
          <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="flex flex-col gap-1">
              <dt className="text-body-s text-lava-muted">{t("importTotalCreate")}</dt>
              <dd className="is-display text-heading-2 tabular-nums">{preview.totals.create}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-body-s text-lava-muted">{t("importTotalUpdate")}</dt>
              <dd className="is-display text-heading-2 tabular-nums">{preview.totals.update}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-body-s text-lava-muted">{t("importTotalError")}</dt>
              <dd className="is-display text-heading-2 tabular-nums">{preview.totals.error}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-body-s text-lava-muted">{t("importTotalPlaces")}</dt>
              <dd className="is-display text-heading-2 tabular-nums">{preview.totals.placesCreated}</dd>
            </div>
          </dl>

          {preview.rows.length === 0 && <p className="text-body">{t("importEmpty")}</p>}
          {preview.rows.length > 0 && importable === 0 && (
            <p className="text-body font-semibold text-danger">{t("importNoValidRows")}</p>
          )}

          {errorRows.length > 0 && (
            <ImportRowsTable id="import-errors" title={t("importSectionErrors")} rows={errorRows} showActive={false} />
          )}
          {createRows.length > 0 && (
            <ImportRowsTable id="import-create" title={t("importSectionCreate")} rows={createRows} showActive={false} />
          )}
          {updateRows.length > 0 && (
            <ImportRowsTable id="import-update" title={t("importSectionUpdate")} rows={updateRows} showActive />
          )}
        </section>
      )}
    </div>
  );
}

function ImportRowsTable({
  id,
  title,
  rows,
  showActive,
}: {
  id: string;
  title: string;
  rows: ImportRowPreview[];
  showActive: boolean;
}) {
  const t = useTranslations("Admin");
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
                {t("importColLine")}
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                {t("colSlug")}
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                {t("colTitle")}
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                {t("colPlace")}
              </th>
              <th scope="col" className="py-2 font-semibold">
                {t("importColDetails")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.line} className="border-b border-divider align-top">
                <td className="py-3 pr-4 tabular-nums">{row.line}</td>
                <td className="py-3 pr-4">{row.slug || "—"}</td>
                <td className="py-3 pr-4">{row.title || "—"}</td>
                <td className="py-3 pr-4">
                  {row.placeSlug || "—"}
                  {row.createsPlace && <span className="ml-2 text-body-s font-semibold">{t("importNewPlace")}</span>}
                </td>
                <td className="flex flex-col gap-2 py-3">
                  {row.errors.length > 0 && <IssueList issues={row.errors} />}
                  {row.warnings.length > 0 && <IssueList issues={row.warnings} />}
                  {showActive && row.activeNow && <p className="text-body-s">{t("importActiveNow")}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IssueList({ issues }: { issues: ImportIssue[] }) {
  const t = useTranslations("Admin");
  return (
    <ul className="flex flex-col gap-1 text-body-s">
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${issue.column ?? ""}-${index}`}>
          {t(`importIssues.${issue.code}`)}
          {issue.column && <> · {t("importIssueColumn", { column: issue.column })}</>}
          {issue.value !== undefined && <> · {t("importIssueValue", { value: issue.value })}</>}
        </li>
      ))}
    </ul>
  );
}
