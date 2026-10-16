"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import type { ProductImportFormAction } from "@/lib/shop/form-values";
import { Field, FormError, FormNotice, Select } from "./fields";

// Importatore CSV dei prodotti dal catalogo del fornitore. Prima l'anteprima (intent=preview), poi la
// conferma (intent=commit) con lo stesso file: il server ripete parsing, validazione e risoluzione
// dei produttori e delle slug. Come use-admin-form.ts, l'azione parte da onSubmit, così il file e il
// fornitore scelti restano nel modulo anche dopo un errore.
export function ProductImport({
  action,
  suppliers,
}: {
  action: ProductImportFormAction;
  suppliers: { id: string; name: string }[];
}) {
  const t = useTranslations("Admin.shop");
  const [state, dispatch, pending] = useActionState(action, { status: "idle" });
  const preview = state.status === "preview" ? state.preview : null;
  const importable = preview ? preview.totals.create + preview.totals.update : 0;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const intent = submitter instanceof HTMLButtonElement && submitter.value === "commit" ? "commit" : "preview";
    const data = new FormData(event.currentTarget);
    data.set("intent", intent);
    startTransition(() => dispatch(data));
  }

  const errorMessage = state.status === "error" ? t(`importErrors.${state.code}`) : null;
  const errorColumns =
    state.status === "error" && state.columns && state.columns.length > 0
      ? t("importErrorColumns", { columns: state.columns.join(", ") })
      : null;

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={onSubmit} className="flex flex-col gap-6" aria-busy={pending}>
        <FormError message={errorMessage} />
        {errorColumns && <p className="text-body-s text-lava-muted">{errorColumns}</p>}
        <FormNotice
          message={state.status === "imported" ? t("importDone", { created: state.created, updated: state.updated }) : null}
        />

        <Field label={t("importSupplier")} htmlFor="product-import-supplier">
          <Select id="product-import-supplier" name="supplierId" required defaultValue="">
            <option value="" disabled>
              {t("chooseOption")}
            </option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t("importFile")} htmlFor="product-import-file" hint={t("productImportFileHint")}>
          <input
            id="product-import-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="min-h-11 text-body file:mr-4 file:min-h-11 file:rounded-pill file:border file:border-border-control file:bg-calce-raised file:px-4 file:font-semibold file:text-lava"
          />
        </Field>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="secondary" value="preview" disabled={pending}>
            {t("importPreview")}
          </Button>
          {preview && (
            <Button type="submit" variant="primary" value="commit" disabled={pending || importable === 0}>
              {t("importCommit", { count: importable })}
            </Button>
          )}
        </div>
      </form>

      {preview && (
        <section aria-labelledby="product-import-preview" className="flex flex-col gap-4">
          <h2 id="product-import-preview" className="is-display text-heading-2">
            {t("importPreviewTitle")}
          </h2>
          <p className="text-body">
            {t("importTotals", {
              create: preview.totals.create,
              update: preview.totals.update,
              error: preview.totals.error,
            })}
          </p>
          <ul className="flex flex-col divide-y divide-divider">
            {preview.rows.map((row) => (
              <li key={row.line} className="flex flex-col gap-1 py-3">
                <p className="text-body">
                  <span className="text-body-s text-lava-muted">{t("importLine", { line: row.line })}</span>{" "}
                  <span className="font-semibold">{row.title}</span>{" "}
                  <span className="text-body-s">{t(`importRowStatus.${row.status}`)}</span>
                </p>
                {row.issues.length > 0 && (
                  <ul className="text-body-s text-danger">
                    {row.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
