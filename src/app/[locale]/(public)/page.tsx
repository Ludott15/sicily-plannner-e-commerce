import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CatalogLocalTip } from "@/components/catalog/catalog-local-tip";
import { ItineraryCard } from "@/components/catalog/itinerary-card";
import { ButtonLink, interestDomain, PendingButton, PendingMarker } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { localizedAlternates } from "@/lib/seo";
import { interestLabels } from "@/server/catalog/labels";
import { listTemplates } from "@/server/catalog/queries";
import { listLatestTips } from "@/server/catalog/tips";

// Home (mockup Home.html e HomeMobile.html). Sezioni del mockup non ancora in pagina,
// perché mancano i dati o la funzione: shop (milestone 10),
// viaggi di gruppo (milestone 8). "Crea il tuo viaggio" è in sospeso fino all'onboarding (M4);
// la pillola "+100 punti a viaggio completato" è in sospeso e nascosta fino alla gamification (M9).

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { description: t("description"), alternates: localizedAlternates(locale, "") };
}

// Interessi di esempio nel passo 1 (mockup: Mare, Cibo e vino, Borghi), etichette dalla tabella interests.
const STEP_INTERESTS = ["sea", "food_wine", "villages"];

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, labels, templates, tips] = await Promise.all([
    getTranslations("Home"),
    interestLabels(locale),
    listTemplates(),
    listLatestTips(3),
  ]);

  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid w-full max-w-[1200px] gap-8 px-4 pt-8 pb-12 md:grid-cols-2 md:items-center md:gap-12 md:px-16 md:py-16">
        {/* Su mobile la foto sta sopra il titolo, su desktop a destra con l'anteprima del giorno. */}
        <div className="relative -mx-4 -mt-8 md:order-2 md:mx-0 md:mt-0">
          <div className="relative aspect-[4/3] overflow-hidden bg-calce-sunk md:aspect-[4/5] md:rounded-xl">
            <span className="is-display absolute bottom-4 left-4 text-heading-2 text-lava-muted">{t("heroPhoto")}</span>
          </div>
          <PendingMarker id="home.points" />
          <div className="absolute top-12 -left-12 hidden w-[320px] rounded-lg bg-calce-raised p-6 shadow-lift md:block">
            <p className="text-label uppercase text-coccio-text">{t("heroDayLabel")}</p>
            <p className="is-display mt-1 text-heading-2">{t("heroDayPlace")}</p>
            <ol className="mt-3 flex flex-col gap-2 text-body">
              {(
                [
                  ["9:30", "heroStop1"],
                  ["12:00", "heroStop2"],
                  ["18:00", "heroStop3"],
                ] as const
              ).map(([time, key]) => (
                <li key={key} className="flex gap-3">
                  <span className="w-12 shrink-0 text-body-s font-semibold text-lava-muted tabular-nums">{time}</span>
                  <span>{t(key)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="flex flex-col gap-6 md:order-1">
          <p className="hidden text-label uppercase text-lava-muted md:block">{t("eyebrow")}</p>
          <h1 className="is-display text-display-xl">{t("title")}</h1>
          <p className="text-body-l text-pretty text-lava-muted">{t("subtitle")}</p>
          <div className="flex flex-wrap items-start gap-3">
            <PendingButton id="home.create-trip" variant="primary">
              {t("createTrip")}
            </PendingButton>
            <ButtonLink href="/itinerari" variant="secondary">
              {t("readyItineraries")}
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* Tre passi (solo desktop, come nel mockup) */}
      <section aria-labelledby="tre-passi" className="hidden border-y border-divider bg-calce-raised md:block">
        <div className="mx-auto max-w-[1200px] px-16 py-16">
          <h2 id="tre-passi" className="is-display text-heading-1">
            {t("stepsTitle")}
          </h2>
          <ol className="mt-8 grid grid-cols-3 gap-6">
            {([1, 2, 3] as const).map((n) => (
              <li key={n} className="flex flex-col gap-3">
                <span className="is-display text-stat">{n}</span>
                <h3 className="text-heading-3">{t(`step${n}Title`)}</h3>
                <p className="text-body text-lava-muted">{t(`step${n}Text`)}</p>
                {n === 1 && (
                  <ul className="flex flex-wrap gap-2" aria-hidden="true">
                    {STEP_INTERESTS.filter((key) => labels.has(key)).map((key) => {
                      const domain = interestDomain(key);
                      return (
                        <li key={key} className={domain ? `is-tag is-tag--${domain}` : "is-tag"}>
                          <span className="is-tag__dot" />
                          {labels.get(key)}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Itinerari pronti: dal catalogo, nessuna card se non ce ne sono */}
      {templates.length > 0 && (
        <section aria-labelledby="itinerari-pronti" className="mx-auto w-full max-w-[1200px] px-4 py-12 md:px-16 md:py-16">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-label uppercase text-lava-muted">{t("readyEyebrow")}</p>
              <h2 id="itinerari-pronti" className="is-display mt-2 text-heading-1">
                {t("readyTitle")}
              </h2>
            </div>
            <Link href="/itinerari" className="shrink-0 text-body font-semibold">
              {t("seeAll")}
            </Link>
          </div>
          <ul className="-mx-4 mt-8 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            {templates.slice(0, 3).map((it) => (
              // Su mobile le card scorrono in orizzontale (mockup HomeMobile).
              <li key={it.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
                <ItineraryCard itinerary={it} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* La voce locale: i consigli verificati più di recente, con firma e data. Su mobile uno
          solo (LocalTip/README.md: al massimo uno per vista). Senza consigli la fascia non c'è. */}
      {tips.length > 0 && (
        <section aria-labelledby="voce-locale" className="border-t border-divider bg-calce-raised">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-12 md:px-16 md:py-16">
            <p className="text-label uppercase text-lava-muted">{t("localEyebrow")}</p>
            <h2 id="voce-locale" className="is-display mt-2 text-heading-1">
              {t("localTitle")}
            </h2>
            <p className="mt-3 max-w-2xl text-body-l text-pretty text-lava-muted">{t("localText")}</p>
            <p className="mt-4 text-body-s">
              <span className="font-semibold">{t("founder")}</span> ·{" "}
              <Link href="/chi-siamo">{t("aboutLink")}</Link>
            </p>
            <ul className="mt-8 grid gap-6 md:grid-cols-3">
              {tips.map((tip, i) => (
                <li key={tip.id} className={i > 0 ? "hidden md:block" : undefined}>
                  <CatalogLocalTip tip={tip} locale={locale} showPlace />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
