import { getTranslations, setRequestLocale } from "next-intl/server";
import { ImportNowButton } from "@/components/admin/import-now-button";
import { adminPartnerImportStatus, runImportNow } from "@/server/partners-import/admin.admin";

// Import partner (passo 3.2): per ogni partner, se la chiave API è impostata, le ultime esecuzioni
// e il pulsante "Esegui ora". Solo admin: il layout dell'area admin risponde 404 agli altri.
const DATE_FORMAT = { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" } as const;

export default async function ImportPartnerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, statuses] = await Promise.all([getTranslations("Admin"), adminPartnerImportStatus()]);
  const formatDate = new Intl.DateTimeFormat(locale, DATE_FORMAT);

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-heading-1">{t("importPartnerTitle")}</h1>
        <p className="max-w-2xl text-body text-lava-muted">{t("importPartnerIntro")}</p>
      </div>

      <ul className="flex flex-col gap-10">
        {statuses.map((status) => (
          <li key={status.partner} data-partner={status.partner} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="is-display text-heading-2">{t(`importPartnerName.${status.partner}`)}</h2>
                <p className="text-body-s text-lava-muted">
                  {status.configured ? t("importPartnerConfigured") : t("importPartnerKeyMissing")}
                </p>
              </div>
              {status.configured && <ImportNowButton partner={status.partner} action={runImportNow} />}
            </div>

            {status.alert && (
              <p role="alert" className="rounded-sm border-[1.5px] border-danger bg-calce-raised px-4 py-3 text-body">
                <span className="font-semibold text-danger">{t("importPartnerAlert")}</span>
              </p>
            )}

            {status.runs.length === 0 ? (
              <p className="text-body text-lava-muted">{t("importPartnerNoRuns")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table aria-label={t("importPartnerRuns")} className="w-full text-left text-body">
                  <thead className="text-body-s text-lava-muted">
                    <tr className="border-b border-divider">
                      <th scope="col" className="py-2 pr-4 font-semibold">
                        {t("importPartnerColStarted")}
                      </th>
                      <th scope="col" className="py-2 pr-4 font-semibold">
                        {t("importPartnerColStatus")}
                      </th>
                      <th scope="col" className="py-2 pr-4 text-right font-semibold">
                        {t("importPartnerColCreated")}
                      </th>
                      <th scope="col" className="py-2 pr-4 text-right font-semibold">
                        {t("importPartnerColUpdated")}
                      </th>
                      <th scope="col" className="py-2 pr-4 text-right font-semibold">
                        {t("importPartnerColDeactivated")}
                      </th>
                      <th scope="col" className="py-2 pr-4 text-right font-semibold">
                        {t("importPartnerColSkipped")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.runs.map((run) => (
                      <tr key={run.startedAt} className="border-b border-divider align-top">
                        <td className="py-3 pr-4 tabular-nums">{formatDate.format(new Date(run.startedAt))}</td>
                        <td className="py-3 pr-4">
                          <span className={run.status === "failed" ? "font-semibold text-danger" : "font-semibold"}>
                            {run.status === "ok" ? t("importPartnerStatusOk") : t("importPartnerStatusFailed")}
                          </span>
                          {run.error && <span className="block text-body-s text-lava-muted">{run.error}</span>}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums">{run.createdCount}</td>
                        <td className="py-3 pr-4 text-right tabular-nums">{run.updatedCount}</td>
                        <td className="py-3 pr-4 text-right tabular-nums">{run.deactivatedCount}</td>
                        <td className="py-3 pr-4 text-right tabular-nums">{run.skippedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
