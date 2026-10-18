import { getTranslations, setRequestLocale } from "next-intl/server";
import { listSearchMisses } from "@/server/search/misses.admin";

// Ricerche senza risultati (passo 11.2): cosa cerca il pubblico e il catalogo non ha ancora.
// Solo testo e conteggio: il registro non contiene chi ha cercato.
const LIMIT = 200;

export default async function AdminSearchMissesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, misses] = await Promise.all([getTranslations("Admin.searchMisses"), listSearchMisses(LIMIT)]);
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-heading-1">{t("title")}</h1>
        <p className="text-body-s text-lava-muted">{t("intro")}</p>
      </div>
      {misses.length === 0 ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-body">
            <thead>
              <tr className="border-b border-divider text-body-s text-lava-muted">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  {t("colQuery")}
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  {t("colMisses")}
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  {t("colFirst")}
                </th>
                <th scope="col" className="py-2 font-semibold">
                  {t("colLast")}
                </th>
              </tr>
            </thead>
            <tbody>
              {misses.map((row) => (
                <tr key={row.query} className="border-b border-divider align-top">
                  <td className="py-2 pr-4 break-words">{row.query}</td>
                  <td className="py-2 pr-4 tabular-nums">{row.misses}</td>
                  <td className="py-2 pr-4 text-body-s text-lava-muted">{dateFormat.format(new Date(row.firstSeen))}</td>
                  <td className="py-2 text-body-s text-lava-muted">{dateFormat.format(new Date(row.lastSeen))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
