import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { aiCostByDay, aiCostByUser, latestChatSessions } from "@/server/chat/stats.admin";

// Admin · Assistente (passo 9.1): costo delle chiamate al modello per giorno e per utente, e le ultime
// conversazioni. Solo metadati (data, utente come iniziali o id breve, messaggi, token, costo): il
// testo dei messaggi non entra mai in questa pagina. La protezione admin è nel layout dell'area.
const DAYS = 30;
const TOP_USERS = 10;
const LATEST = 20;

type Props = { params: Promise<{ locale: string }> };

export default async function AdminAiPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, format, byDay, byUser, latest] = await Promise.all([
    getTranslations("Admin.ai"),
    getFormatter(),
    aiCostByDay(DAYS),
    aiCostByUser(DAYS, TOP_USERS),
    latestChatSessions(LATEST),
  ]);

  const money = (usd: number) => format.number(usd, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const count = (value: number) => format.number(value, { maximumFractionDigits: 0 });
  const headCell = "py-3 pr-4 font-semibold text-left";
  const cell = "py-3 pr-4 align-top";

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-heading-1">{t("title")}</h1>
        <p className="max-w-2xl text-body text-lava-muted">{t("intro")}</p>
      </div>

      <section aria-labelledby="ai-by-day" className="flex flex-col gap-4">
        <h2 id="ai-by-day" className="is-display text-heading-2">
          {t("byDayTitle")}
        </h2>
        {byDay.length === 0 ? (
          <p className="text-body text-lava-muted">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse">
              <caption className="mb-3 text-left text-body-s text-lava-muted">{t("byDayCaption", { days: DAYS })}</caption>
              <thead>
                <tr className="border-b border-divider text-body-s text-lava-muted">
                  <th scope="col" className={headCell}>{t("colDay")}</th>
                  <th scope="col" className={headCell}>{t("colMessages")}</th>
                  <th scope="col" className={headCell}>{t("colTokens")}</th>
                  <th scope="col" className={headCell}>{t("colCost")}</th>
                </tr>
              </thead>
              <tbody>
                {byDay.map((row) => (
                  <tr key={row.day} className="border-b border-divider">
                    <td className={cell}>{row.day}</td>
                    <td className={cell}>{count(row.messages)}</td>
                    <td className={cell}>{`${count(row.inputTokens)} / ${count(row.outputTokens)}`}</td>
                    <td className={cell}>{money(row.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="ai-by-user" className="flex flex-col gap-4">
        <h2 id="ai-by-user" className="is-display text-heading-2">
          {t("byUserTitle")}
        </h2>
        {byUser.length === 0 ? (
          <p className="text-body text-lava-muted">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse">
              <caption className="mb-3 text-left text-body-s text-lava-muted">{t("byUserCaption", { days: DAYS })}</caption>
              <thead>
                <tr className="border-b border-divider text-body-s text-lava-muted">
                  <th scope="col" className={headCell}>{t("colUser")}</th>
                  <th scope="col" className={headCell}>{t("colMessages")}</th>
                  <th scope="col" className={headCell}>{t("colTokens")}</th>
                  <th scope="col" className={headCell}>{t("colCost")}</th>
                </tr>
              </thead>
              <tbody>
                {byUser.map((row, index) => (
                  <tr key={`${row.userLabel}-${index}`} className="border-b border-divider">
                    <td className={cell}>{row.userLabel}</td>
                    <td className={cell}>{count(row.messages)}</td>
                    <td className={cell}>{`${count(row.inputTokens)} / ${count(row.outputTokens)}`}</td>
                    <td className={cell}>{money(row.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="ai-latest" className="flex flex-col gap-4">
        <h2 id="ai-latest" className="is-display text-heading-2">
          {t("latestTitle")}
        </h2>
        {latest.length === 0 ? (
          <p className="text-body text-lava-muted">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <caption className="mb-3 text-left text-body-s text-lava-muted">{t("latestCaption")}</caption>
              <thead>
                <tr className="border-b border-divider text-body-s text-lava-muted">
                  <th scope="col" className={headCell}>{t("colDate")}</th>
                  <th scope="col" className={headCell}>{t("colUser")}</th>
                  <th scope="col" className={headCell}>{t("colMessages")}</th>
                  <th scope="col" className={headCell}>{t("colTokens")}</th>
                  <th scope="col" className={headCell}>{t("colCost")}</th>
                </tr>
              </thead>
              <tbody>
                {latest.map((row) => (
                  <tr key={row.id} className="border-b border-divider">
                    <td className={cell}>
                      {format.dateTime(new Date(row.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className={cell}>{row.userLabel || t("anonymous")}</td>
                    <td className={cell}>{count(row.messageCount)}</td>
                    <td className={cell}>{`${count(row.inputTokens)} / ${count(row.outputTokens)}`}</td>
                    <td className={cell}>{money(row.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
