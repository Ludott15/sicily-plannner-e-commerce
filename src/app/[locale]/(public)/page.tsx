import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { BedDouble, Car, Luggage, Plane, type LucideIcon } from "lucide-react";
import { CatalogLocalTip } from "@/components/catalog/catalog-local-tip";
import { JsonLd } from "@/components/catalog/json-ld";
import { CoverPicture } from "@/components/catalog/cover-picture";
import { FeaturedPlaces } from "@/components/catalog/featured-places";
import { ItineraryCard } from "@/components/catalog/itinerary-card";
import { PlaceCard } from "@/components/catalog/place-card";
import { ButtonLink, PointsPill } from "@/components/design";
import { FlightSearch } from "@/components/flights/flight-search";
import { ShopProductCard } from "@/components/shop/shop-product-card";
import { Link } from "@/lib/i18n/navigation";
import type { CoverMedia } from "@/lib/media";
import { canonicalFor } from "@/lib/seo";
import { shuffle } from "@/lib/shuffle";
import { organization } from "@/lib/structured-data";
import { getUser } from "@/server/auth";
import { getHomePoints } from "@/server/gamification/queries";
import { getHomeHero, listFeaturedPlaces, listTemplates } from "@/server/catalog/queries";
import { listGuides } from "@/server/editorial/queries";
import { listLatestTips } from "@/server/catalog/tips";
import { listProducts } from "@/server/shop/queries";

// Home (redesign del 2026-10-20: docs/design/mockups/Home.html e HomeMobile.html restano invariati,
// la home si discosta per decisione di Ludovico, vedi docs/design/README.md).
// Ordine delle sezioni, ciascuna con un ruolo, un titolo e un solo invito all'azione:
// 1. hero con la foto di un luogo in evidenza scelto a caso (nessun testo sulla foto, didascalia in /crediti-foto);
// 2. ricerca voli compatta, integrata come barra sotto l'hero;
// 3. come funziona, in tre passi;
// 4. itinerari pronti; 5. dove andare (luoghi in evidenza, carosello);
// 6. organizza il viaggio (alloggi, noleggio, voli, servizi); 7. voce locale;
// 8. le ultime guide; 9. lo shop, con tre prodotti disponibili.
// Ogni sezione senza dati non compare. La pagina è dinamica: connection() rimanda il rendering alla
// richiesta, così il mescolamento avviene sul server e i client component non usano Math.random.
// Chi ha l'account vede il saldo dei punti (passo 5.1), che porta a /punti.

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { description: t("description"), alternates: canonicalFor(locale, "") };
}

// Il carosello compare solo con almeno quattro luoghi con foto propria (contratto 1.2).
const MIN_FEATURED_PLACES = 4;

// Una sola scala verticale per tutte le sezioni (manuale: space-12 su mobile, space-16 su desktop).
const SECTION = "mx-auto w-full max-w-[1200px] px-4 py-12 md:px-16 md:py-16";
const SECTION_TITLE = "is-display mt-2 text-heading-1";
const EYEBROW = "text-label uppercase text-lava-muted";

type HeroImage = { placeName: string; placeSlug: string; media: CoverMedia };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await connection();

  const user = await getUser();
  const [t, tPoints, tGuides, homeHero, featured, templates, tips, guides, shopProducts, points] = await Promise.all([
    getTranslations("Home"),
    getTranslations("Points"),
    getTranslations("Guides"),
    getHomeHero(),
    listFeaturedPlaces(),
    listTemplates(),
    listLatestTips(3),
    listGuides(locale),
    listProducts({}, locale),
    user ? getHomePoints(user) : Promise.resolve(null),
  ]);

  // Hero: un luogo in evidenza a caso. Senza luoghi in evidenza, il luogo di getHomeHero().
  const [heroPlace] = shuffle(featured);
  const hero: HeroImage | null = heroPlace
    ? { placeName: heroPlace.name, placeSlug: heroPlace.slug, media: heroPlace.cover }
    : homeHero?.cover
      ? { placeName: homeHero.placeName, placeSlug: homeHero.placeSlug, media: homeHero.cover.media }
      : null;

  // Carosello: stessi luoghi, ordine casuale a ogni richiesta (il luogo dell'hero può comparire).
  const carousel = shuffle(featured);

  const steps = [
    { title: t("howStep1Title"), text: t("howStep1Text") },
    { title: t("howStep2Title"), text: t("howStep2Text") },
    { title: t("howStep3Title"), text: t("howStep3Text") },
  ];

  const services: { href: string; icon: LucideIcon; title: string; text: string }[] = [
    { href: "/dove-dormire", icon: BedDouble, title: t("serviceLodgingTitle"), text: t("serviceLodgingText") },
    { href: "/noleggio-auto", icon: Car, title: t("serviceCarTitle"), text: t("serviceCarText") },
    { href: "/voli", icon: Plane, title: t("serviceFlightsTitle"), text: t("serviceFlightsText") },
    { href: "/servizi", icon: Luggage, title: t("servicePrepTitle"), text: t("servicePrepText") },
  ];

  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      {/* 1. Hero: su mobile la foto è a tutta larghezza sopra il testo, su desktop a destra.
          Nessun testo e nessuna didascalia sulla foto; il nome del luogo è un link sotto. */}
      <section className="mx-auto grid w-full max-w-[1200px] gap-8 px-4 pt-8 pb-12 md:grid-cols-2 md:items-center md:gap-12 md:px-16 md:py-16">
        {hero && (
          <div className="-mx-4 -mt-8 md:order-2 md:mx-0 md:mt-0">
            <div className="relative aspect-[4/3] overflow-hidden bg-calce-sunk md:aspect-[4/5] md:rounded-xl">
              <CoverPicture
                cover={hero.media}
                ratio="4x5"
                sizes="(min-width: 768px) 50vw, 100vw"
                locale={locale}
                priority
              />
            </div>
            <Link href={`/luoghi/${hero.placeSlug}`} className="mt-2 block px-4 text-body-s font-semibold md:px-0">
              {hero.placeName}
            </Link>
          </div>
        )}
        <div className="flex flex-col gap-6 md:order-1">
          <p className={EYEBROW}>{t("eyebrow")}</p>
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
          <p className="text-body-s text-lava-muted">{t("trustLine")}</p>
          {points !== null && (
            <Link href="/punti" aria-label={tPoints("homeLink")} className="self-start rounded-pill">
              <PointsPill points={points} />
            </Link>
          )}
        </div>
      </section>

      {/* 2. Ricerca voli compatta: una barra sotto l'hero; la ricerca completa è in /voli. */}
      <section aria-labelledby="voli-home" className="border-y border-divider bg-calce-sunk">
        <div className={`${SECTION} grid gap-6 md:grid-cols-[1fr_1.4fr] md:items-start md:gap-12`}>
          <div className="flex flex-col gap-3">
            <p className={EYEBROW}>{t("flightsEyebrow")}</p>
            <h2 id="voli-home" className="is-display text-heading-1">
              {t("flightsTitle")}
            </h2>
            <p className="text-body text-pretty text-lava-muted">{t("flightsText")}</p>
          </div>
          <FlightSearch
            variant="compact"
            initial={{ origin: null, destination: null, departure: null, returnDate: null, passengers: 1, itineraryId: null }}
          />
        </div>
      </section>

      {/* 3. Come funziona: tre passi brevi, con numeri tipografici. */}
      <section aria-labelledby="come-funziona" className={SECTION}>
        <h2 id="come-funziona" className="is-display text-heading-1">
          {t("howTitle")}
        </h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3">
              <span aria-hidden="true" className="is-display text-display-l text-lava">
                {index + 1}
              </span>
              <h3 className="text-heading-3 font-semibold">{step.title}</h3>
              <p className="text-body text-pretty text-lava-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 4. Itinerari pronti: dal catalogo, nessuna sezione se non ce ne sono. */}
      {templates.length > 0 && (
        <section aria-labelledby="itinerari-pronti" className={SECTION}>
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className={EYEBROW}>{t("readyEyebrow")}</p>
              <h2 id="itinerari-pronti" className={SECTION_TITLE}>
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

      {/* 5. Dove andare in Sicilia: luoghi in evidenza con foto propria, in ordine casuale. */}
      {featured.length >= MIN_FEATURED_PLACES && (
        <section aria-labelledby="dove-andare" className={SECTION}>
          <p className={EYEBROW}>{t("placesEyebrow")}</p>
          <h2 id="dove-andare" className={SECTION_TITLE}>
            {t("placesTitle")}
          </h2>
          <div className="mt-8">
            <FeaturedPlaces label={t("placesTitle")} prevLabel={t("placesPrev")} nextLabel={t("placesNext")}>
              {carousel.map((place) => (
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

      {/* 6. Organizza il viaggio: le verticali dei servizi, ciascuna su una pagina. */}
      <section aria-labelledby="organizza-viaggio" className="border-y border-divider bg-calce-raised">
        <div className={SECTION}>
          <h2 id="organizza-viaggio" className="is-display text-heading-1">
            {t("organizeTitle")}
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((service) => (
              <li key={service.href}>
                <Link
                  href={service.href}
                  className="flex h-full min-h-44 flex-col gap-3 rounded-lg border border-card-edge bg-calce p-5 text-lava no-underline shadow-card hover:shadow-lift focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <service.icon size={24} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-mare" />
                  <span className="text-heading-3 font-semibold">{service.title}</span>
                  <span className="text-body-s text-lava-muted">{service.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 7. La voce locale: i consigli verificati più di recente, con firma e data. Su mobile uno
          solo (LocalTip/README.md: al massimo uno per vista). Senza consigli la sezione non c'è. */}
      {tips.length > 0 && (
        <section aria-labelledby="voce-locale" className="bg-calce-sunk">
          <div className={SECTION}>
            <p className={EYEBROW}>{t("localEyebrow")}</p>
            <h2 id="voce-locale" className={SECTION_TITLE}>
              {t("localTitle")}
            </h2>
            <p className="mt-3 max-w-2xl text-body-l text-pretty text-lava-muted">{t("localText")}</p>
            <p className="mt-4 text-body-s">
              <span className="font-semibold">{t("founder")}</span> ·{" "}
              <Link href="/chi-siamo" className="underline underline-offset-4">{t("aboutLink")}</Link>
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

      {/* 8. Le ultime guide della redazione: le tre più recenti (la query ordina per data). */}
      {guides.length > 0 && (
        <section aria-labelledby="guide-home" className={SECTION}>
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h2 id="guide-home" className="is-display text-heading-1">
                {t("guidesTitle")}
              </h2>
            </div>
            <Link href="/guide" className="shrink-0 text-body font-semibold">
              {t("guidesAll")}
            </Link>
          </div>
          <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {guides.slice(0, 3).map((guide) => (
              <li key={guide.slug}>
                <article className="is-card">
                  <div className="is-card__media">
                    {guide.cover ? (
                      <CoverPicture
                        cover={guide.cover}
                        ratio="4x5"
                        sizes="(min-width: 1024px) 352px, (min-width: 640px) 50vw, 100vw"
                        locale={locale}
                        decorative
                      />
                    ) : (
                      <span className="is-card__ph" aria-hidden="true">
                        {guide.title}
                      </span>
                    )}
                  </div>
                  <div className="is-card__body">
                    <h3 className="is-card__title">
                      <Link href={`/guide/${guide.slug}`} className="is-card__link">
                        {guide.title}
                      </Link>
                    </h3>
                    {guide.summary && <p className="text-body text-lava-muted">{guide.summary}</p>}
                    <p className="is-card__meta">
                      {tGuides("byAuthor", { author: guide.author })} · {dateFormat.format(new Date(guide.publishedAt))}
                    </p>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 9. Lo shop: tre prodotti disponibili, solo se ce ne sono. */}
      {shopProducts.length > 0 && (
        <section aria-labelledby="shop-home" className="border-t border-divider bg-calce-raised">
          <div className={SECTION}>
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className={EYEBROW}>{t("shopEyebrow")}</p>
                <h2 id="shop-home" className={SECTION_TITLE}>
                  {t("shopTitle")}
                </h2>
              </div>
              <Link href="/shop" className="shrink-0 text-body font-semibold">
                {t("shopAll")}
              </Link>
            </div>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {shopProducts.slice(0, 3).map((product) => (
                <li key={product.id}>
                  <ShopProductCard product={product} locale={locale} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <JsonLd data={organization()} />
    </>
  );
}
