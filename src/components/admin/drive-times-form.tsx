"use client";

import { useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { buttonClass } from "@/components/design";
import type { AdminFormAction } from "@/lib/admin-form";
import { FormError, FormNotice, TextInput } from "./fields";
import { useAdminForm } from "./use-admin-form";

// Tempi di guida tra aree (M4 parte 4): una riga per coppia di aree, con i minuti in un input
// (vuoto = coppia senza tempo, quindi non componibile). Le coppie partono come JSON nel campo
// "pairs"; la validazione sta nell'azione server. Il riepilogo conta le coppie compilate.

export type DriveTimeRow = {
  key: string;
  a: string;
  b: string;
  first: string;
  second: string;
  minutes: number | null;
};

// Un valore non numerico non si cancella in silenzio: diventa 0 e l'azione server lo rifiuta.
function parseMinutes(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isNaN(value) ? 0 : value;
}

export function DriveTimesForm({
  action,
  locale,
  rows,
}: {
  action: AdminFormAction;
  locale: string;
  rows: DriveTimeRow[];
}) {
  const t = useTranslations("AdminDriveTimes");
  const tAdmin = useTranslations("Admin");
  const save = useAdminForm(action);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.key, row.minutes === null ? "" : String(row.minutes)])),
  );

  const pairs = rows.map((row) => ({ a: row.a, b: row.b, minutes: parseMinutes(values[row.key] ?? "") }));
  const filled = pairs.filter((pair) => pair.minutes !== null).length;

  return (
    <form onSubmit={save.onSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="pairs" value={JSON.stringify(pairs)} />
      <FormError message={save.state.status === "error" ? tAdmin(`errors.${save.state.code}`) : null} />
      <FormNotice message={save.state.status === "saved" ? t("saved") : null} />

      <div className="flex flex-col gap-1">
        <p className="text-body font-semibold" aria-live="polite">
          {t("filled", { count: filled, total: rows.length })}
        </p>
        <p className="text-caption text-lava-muted">{t("hint")}</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-card-edge bg-calce-raised">
        <table className="w-full border-collapse text-left text-body">
          <thead>
            <tr className="border-b border-divider">
              <th scope="col" className="px-4 py-3 text-body-s font-semibold">
                {t("pairColumn")}
              </th>
              <th scope="col" className="px-4 py-3 text-body-s font-semibold">
                {t("minutesColumn")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key} className="border-b border-divider last:border-b-0">
                <td className="px-4 py-2">{`${row.first} — ${row.second}`}</td>
                <td className="px-4 py-2">
                  <TextInput
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={600}
                    step={1}
                    id={`drive-time-${index}`}
                    aria-label={t("minutesFor", { a: row.first, b: row.second })}
                    value={values[row.key] ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      const { value } = event.target;
                      setValues((current) => ({ ...current, [row.key]: value }));
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <button type="submit" className={buttonClass("primary")} disabled={save.pending}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}
