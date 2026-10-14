import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CatalogLocalTip } from "@/components/catalog/catalog-local-tip";
import { CoverCaption } from "@/components/catalog/cover-figure";
import { CoverPicture } from "@/components/catalog/cover-picture";
import { FeaturedPlaces } from "@/components/catalog/featured-places";
import { ItineraryCard } from "@/components/catalog/itinerary-card";
import { PlaceCard } from "@/components/catalog/place-card";
import { ButtonLink, PendingMarker } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { localizedAlternates } from "@/lib/seo";
import { getHomeHero, listFeaturedPlaces, listTemplates } from "@/server/catalog/queries";
import { listLatestTips } from "@/server/catalog/tips";

// Home (passo 1.2 della roadmap; docs/design/mockups/README.md: i mockup Home sono superati).
// Hero con la foto del luogo in evidenza di home (nessun testo sulla foto), carosello dei
// luoghi con foto propria (solo da quattro), itinerari pronti e voce locale.
// La pillola "+100 punti a viaggio completato" è in sospeso e nascosta fino alla gamification (M9).

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { description: t("description"), alternates: localizedAlternates(locale, "") };
}

// Il carosello compare solo con almeno quattro luoghi con foto propria (contratto 1.2).
const MIN_FEATURED_PLACES = 4;

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, hero, featured, templates, tips] = await Promise.all([
    getTranslations("Home"),
    getHomeHero(),
    listFeaturedPlaces(),
    listTemplates(),
    listLatestTips(3),
  ]);

  return (
    <>
      {/* Hero: su mobile la foto è a tutta larghezza sopra il testo, su desktop a destra.
          Senza nessuna foto resta un blocco calce-sunk senza testo. */}
      <section className="mx-auto grid w-full max-w-[1200px] gap-8 px-4 pt-8 pb-12 md:grid-cols-2 md:items-center md:gap-12 md:px-16 md:py-16">
        {hero && (
          <div className="-mx-4 -mt-8 md:order-2 md:mx-0 md:mt-0">
            <figure className="flex flex-col gap-2">
              <div className="relative aspect-[4/3] overflow-hidden bg-calce-sunk md:aspect-[4/5] md:rounded-xl">
                {hero.cover && (
                  <CoverPicture
                    cover={hero.cover.media}
                    ratio="4x5"
                    sizes="(min-width: 768px) 50vw, 100vw"
                    locale={locale}
                    priority
                  />
                )}
              </div>
              {hero.cover && <CoverCaption cover={hero.cover.media} className="px-4 md:px-0" />}
            </figure>
            <Link href={`/luoghi/${hero.placeSlug}`} className="mt-2 block px-4 text-body-s font-semibold md:px-0">
              {hero.placeName}
            </Link>
          </div>
        )}
        <div className="flex flex-col gap-6 md:order-1">
          <p className="hidden text-label uppercase text-lava-muted md:block">{t("eyebrow")}</p>
          <h1 className="is-display text-display-xl">{t("title")}</h1>
          <p className="text-body-l text-pretty text-lava-muted">{t("subtitle")}</p>
          <div className="flex flex-wrap items-start gap-3">
            <ButtonLink href="/viaggio/nuovo" variant="primary">
              {t("createTrip")}
            </ButtonLink>
            <ButtonLink href="/itinerari" variant="secondary">
              {t("readyItineraries")}
            </ButtonLink>
          </div>
          <PendingMarker id="home.points" />
        </div>
      </section>

      {/* Dove andare in Sicilia: luoghi in evidenza con foto propria, nell'ordine dell'admin. */}
      {featured.length >= MIN_FEATURED_PLACES && (
        <section aria-labelledby="dove-andare" className="mx-auto w-full max-w-[1200px] px-4 py-12 md:px-16 md:py-16">
          <p className="text-label uppercase text-lava-muted">{t("placesEyebrow")}</p>
          <h2 id="dove-andare" className="is-display mt-2 text-heading-1">
            {t("placesTitle")}
          </h2>
          <div className="mt-8">
            <FeaturedPlaces label={t("placesTitle")} prevLabel={t("placesPrev")} nextLabel={t("placesNext")}>
              {featured.map((place) => (
                <li key={place.id} className="w-[78%] shrink-0 snap-start md:w-[28%]">
                  <PlaceCard
                    slug={place.slug}
                    name={place.name}
                    areaName={locale === "en" ? (place.areaNameEn ?? place.areaNameIt) : place.areaNameIt}
                    taglineIt={locale === "it" ? place.taglineIt : null}
                    cover={place.cover}
                    locale={locale}
                  />
                </li>
              ))}
            </FeaturedPlaces>
          </div>
        </section>
      )}

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
                <ItineraryCard itinerary={it} showAreas />
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
