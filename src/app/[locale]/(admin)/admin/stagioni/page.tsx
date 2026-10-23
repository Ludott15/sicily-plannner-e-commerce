import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { CloseSeasonForm, PrizeStatusForm } from "@/components/admin/season-forms";
import { ButtonLink } from "@/components/design";
import { currentSeasonKey, isSeasonKey, isSeasonOver, seasonParts, shiftSeason } from "@/lib/season-nav";
import { closeSeason, listSeasonAwards, setPrizeStatus } from "@/server/gamification/seasons.admin";

// Stagioni (passo 5.3). Per la stagione scelta (default: la precedente) si chiude la stagione, che
// fotografa i primi 10 non in opt-out, e si segna lo stato del premio di ogni riga. Si chiude solo a
// stagione finita; la chiusura si fa una volta sola (lo decide il server).

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ stagione?: string }> };

const GROUPING = { useGrouping: "always" } as const;

export default async function AdminSeasonsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { stagione } = await searchParams;
  const current = currentSeasonKey();
  const season = isSeasonKey(stagione) ? stagione : shiftSeason(current, -1);
  const recent = [-3, -2, -1, 0].map((steps) => shiftSeason(current, steps));

  const [t, format, awards] = await Promise.all([
    getTranslations("AdminSeasons"),
    getFormatter(),
    listSeasonAwards(season),
  ]);

  const label = (key: string): string => {
    const parts = seasonParts(key);
    if (!parts) return key;
    return parts.half === "summer"
      ? t("seasonSummer", { year: String(parts.year) })
      : t("seasonWinter", { year: String(parts.year), nextYear: String(parts.year + 1) });
  };
  const over = isSeasonOver(season);

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-heading-1">{t("title")}</h1>
        <p className="max-w-2xl text-body text-lava-muted">{t("intro")}</p>
      </div>

      <nav aria-label={t("seasonNav")} className="flex flex-wrap gap-3">
        {recent.map((key) => (
          <ButtonLink
            key={key}
            href={`/admin/stagioni?stagione=${key}`}
            variant="secondary"
            size="sm"
            aria-current={key === season ? "page" : undefined}
          >
            {label(key)}
          </ButtonLink>
        ))}
      </nav>

      <section aria-labelledby="premi-stagione" className="flex flex-col gap-6">
        <h2 id="premi-stagione" className="is-display text-heading-2">
          {t("awardsTitle")}
        </h2>
        {!over && <p className="text-body text-lava-muted">{t("notOver")}</p>}

        {awards.length === 0 ? (
          <p className="text-body text-lava-muted">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse">
              <caption className="mb-3 text-left text-body-s text-lava-muted">
                {t("awardsCaption", { season: label(season) })}
              </caption>
              <thead>
                <tr className="border-b border-divider text-left text-body-s text-lava-muted">
                  <th scope="col" className="py-3 pr-4 font-semibold">
                    {t("colRank")}
                  </th>
                  <th scope="col" className="py-3 pr-4 font-semibold">
                    {t("colName")}
                  </th>
                  <th scope="col" className="py-3 pr-4 text-right font-semibold">
                    {t("colPoints")}
                  </th>
                  <th scope="col" className="py-3 font-semibold">
                    {t("colPrize")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {awards.map((award) => (
                  <tr key={award.rank} data-rank={award.rank} className="border-b border-divider align-top">
                    <th scope="row" className="py-3 pr-4 font-normal tabular-nums">
                      {award.rank}
                    </th>
                    <td className="py-3 pr-4">{award.publicName ?? t("deletedAccount")}</td>
                    <td className="py-3 pr-4 text-right font-semibold tabular-nums">
                      {format.number(award.points, GROUPING)}
                    </td>
                    <td className="py-3">
                      <PrizeStatusForm
                        action={setPrizeStatus}
                        season={season}
                        rank={award.rank}
                        status={award.prizeStatus}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {awards.length > 0 && <p className="text-body-s text-lava-muted">{t("closedNote")}</p>}
        {over && awards.length === 0 && <CloseSeasonForm action={closeSeason} season={season} />}
      </section>

      <div>
        <ButtonLink href="/punti/regolamento" variant="secondary">
          {t("prizeRules")}
        </ButtonLink>
      </div>
    </section>
  );
}
