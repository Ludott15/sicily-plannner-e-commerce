import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink, ItineraryStop, Route } from "@/components/design";
import { formatDuration } from "@/lib/format";
import { redirect } from "@/lib/i18n/navigation";
import { provinceName } from "@/lib/provinces";
import { getUser } from "@/server/auth";
import { interestLabels } from "@/server/catalog/labels";
import { engineCatalog, getSavedAnswers, toProfile } from "@/server/personalization/data";
import { propose, type Reason } from "@/server/personalization/engine";

// "Ecco tre viaggi pensati per te" (schemi.md): tre proposte costruite dal catalogo dal
// motore (server/personalization/engine.ts), ogni tappa con "Per te" e i suoi motivi.
// Le proposte si calcolano a ogni visita dalle risposte salvate: salvarle come itinerario
// arriva con il builder (M5). Pagina personale: non indicizzata.
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Proposals" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function ProposalsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getUser();
  const saved = user ? await getSavedAnswers(user) : null;
  if (!saved?.completed) return redirect({ href: "/viaggio/nuovo", locale });

  const [t, labels, catalog] = await Promise.all([getTranslations("Proposals"), interestLabels(locale), engineCatalog()]);
  const proposals = propose(catalog, toProfile(saved));
  const label = (key: string) => labels.get(key) ?? key;
  const reasonText = (r: Reason): string => {
    switch (r.code) {
      case "combines":
        return t("reasons.combines", { a: label(r.interests[0]), b: label(r.interests[1]).toLowerCase() });
      case "topForInterest":
        return t("reasons.topForInterest", { interest: label(r.interest).toLowerCase() });
      case "topRated":
        return t("reasons.topRated", { rating: r.rating.toLocaleString(locale) });
      default:
        return t(`reasons.${r.code}`);
    }
  };

  return (
    <section className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-16 md:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="is-display text-display-l">{t("title")}</h1>
          <p className="mt-3 text-body-l text-pretty text-lava-muted">{t("intro")}</p>
        </div>
        <ButtonLink href="/viaggio/nuovo" variant="secondary">
          {t("changePreferences")}
        </ButtonLink>
      </div>

      {proposals.length === 0 ? (
        <div className="mt-10 flex flex-col items-start gap-4">
          <p className="text-body-l">{t("empty")}</p>
          <ButtonLink href="/viaggio/nuovo" variant="primary">
            {t("changePreferences")}
          </ButtonLink>
        </div>
      ) : (
        <ol className="mt-10 grid gap-12 lg:grid-cols-3 lg:gap-8">
          {proposals.map((proposal, i) => (
            <li key={proposal.zone} className="flex flex-col gap-4">
              <h2 className="is-display text-heading-1">
                {t("proposalTitle", { n: i + 1, zone: provinceName(proposal.zone) })}
              </h2>
              <p className="text-body-s text-lava-muted">{t("proposalMeta", { days: proposal.days.length })}</p>
              {proposal.days.map((day, d) => (
                <div key={d} className="flex flex-col gap-2">
                  <h3 className="text-body font-semibold">{t("day", { n: d + 1, zone: provinceName(day.zone) })}</h3>
                  <Route>
                    {day.activities.map((a) => (
                      <ItineraryStop
                        key={a.id}
                        title={a.title}
                        href={`/attivita/${a.slug}`}
                        meta={`${a.placeName} · ${formatDuration(a.durationMin)}`}
                        why={a.reasons.length > 0 ? { kind: "personal", reasons: a.reasons.map(reasonText) } : undefined}
                      />
                    ))}
                  </Route>
                </div>
              ))}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
