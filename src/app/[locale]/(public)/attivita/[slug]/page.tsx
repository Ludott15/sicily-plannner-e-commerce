import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Breadcrumb } from "@/components/catalog/breadcrumb";
import { CoverFigure } from "@/components/catalog/cover-figure";
import { CatalogActivityCard } from "@/components/catalog/catalog-activity-card";
import { CatalogLocalTip } from "@/components/catalog/catalog-local-tip";
import { JsonLd } from "@/components/catalog/json-ld";
import { ShareButton } from "@/components/catalog/share-button";
import { ReviewsSection, type ReviewViewer } from "@/components/reviews/reviews-section";
import {
  AffiliateOffer,
  affiliateHref,
  BookingBar,
  ButtonAnchor,
  ButtonLink,
  interestDomain,
} from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { formatDuration, formatEur, formatSeason } from "@/lib/format";
import { provinceName } from "@/lib/provinces";
import { canonicalFor, truncate } from "@/lib/seo";
import { breadcrumbList, touristAttraction } from "@/lib/structured-data";
import { getUser } from "@/server/auth";
import { interestLabels } from "@/server/catalog/labels";
import { partnerName, type Partner } from "@/server/affiliates/links";
import { getActivity, listActivityOffers, listNearbyActivities } from "@/server/catalog/queries";
import { itinerariesWithActivity } from "@/server/catalog/area-queries";
import { getActivityTip } from "@/server/catalog/tips";
import { getActivityReviews } from "@/server/gamification/queries";

// Scheda attività (mockup Attivita.html e AttivitaMobile.html).
// Non ancora in pagina, perché mancano dati o funzioni: galleria (una sola foto o il
// segnaposto), "Perché è per te" (M4), "Da sapere",
// prodotti della zona (M10). Le recensioni (passo 5.1) sono in fondo alla pagina, con il modulo
// per chi è idoneo; "+10 punti con il check-in" è nella pagina del viaggio.
// "Aggiungi al viaggio" porta a /viaggi/aggiungi (scelta del viaggio e del giorno, M5).
// Offerte: prodotti dei partner (activity_offers), dalla più economica; la prima è anche
// nella barra mobile. Il prezzo dell'attività è quello pagato in loco (ingresso, biglietto),
// un metadato e mai un'offerta. Senza offerte non c'è né AffiliateOffer né offerta nella barra.

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ avviso?: string }>;
};

export async function generateMetadata({ params }: Omit<Props, "searchParams">): Promise<Metadata> {
  const { locale, slug } = await params;
  const activity = await getActivity(slug, locale);
  if (!activity) return {};

  const description = truncate(activity.description) ?? `${activity.title} · ${activity.placeName}`;
  return {
    title: `${activity.title} · ${activity.placeName}`,
    description,
    alternates: canonicalFor(locale, `/attivita/${activity.slug}`),
    openGraph: { title: activity.title, description, type: "article" },
  };
}

export default async function ActivityPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const activity = await getActivity(slug, locale);
  if (!activity) notFound();

  const user = await getUser();
  const [t, labels, nearby, offerRows, tip, { avviso }, reviewState, itineraries] = await Promise.all([
    getTranslations("Catalog"),
    interestLabels(locale),
    listNearbyActivities(activity.id, activity.placeId, activity.placeProvince),
    listActivityOffers(activity.id),
    getActivityTip(activity.id, activity.placeId),
    searchParams,
    getActivityReviews(activity.id, user),
    itinerariesWithActivity(activity.id, locale),
  ]);
  const viewer: ReviewViewer = !user ? "visitor" : user.is_anonymous ? "guest" : "user";

  const dayMonth = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  // Solo offerte di partner che si possono nominare (riga di trasparenza obbligatoria).
  const offers = offerRows.flatMap((o) => {
    const partner = partnerName(o.partner as Partner);
    if (!partner) return [];
    return [
      {
        ...o,
        partner,
        price: formatEur(o.priceFromEur, locale, o.currency),
        rating: o.rating !== null && o.reviewsCount ? { value: o.rating, count: o.reviewsCount } : null,
        priceUpdated: o.priceUpdatedAt ? dayMonth.format(o.priceUpdatedAt) : null,
      },
    ];
  });
  const mainOffer = offers[0];
  const offerList = offers.map((o) => (
    <AffiliateOffer
      key={o.id}
      offerId={o.id}
      locale={locale}
      title={o.title}
      partner={o.partner}
      price={o.price}
      rating={o.rating}
      freeCancellation={o.freeCancellation === true}
      priceUpdated={o.priceUpdated}
    />
  ));

  const price = formatEur(activity.onSitePriceEur, locale);
  const season = formatSeason(activity.seasonMonths, locale);

  // Metadati del titolo: numeri concreti, compreso il prezzo in loco.
  const meta = [
    formatDuration(activity.durationMin),
    activity.requiresCar ? t("carNeeded") : null,
    price !== null ? (Number(activity.onSitePriceEur) === 0 ? t("freeMeta") : t("priceMeta", { price })) : null,
    season,
    activity.accessible ? t("accessible") : null,
  ].filter((m): m is string => Boolean(m));

  const photo = (
    <div className="-mx-4 md:mx-0">
      <CoverFigure
        cover={activity.cover}
        ratio="16x9"
        sizes="(min-width: 1200px) 1072px, (min-width: 768px) calc(100vw - 128px), 100vw"
        locale={locale}
        placeholder={activity.placeName}
        priority
        frameClassName="aspect-[4/3] md:aspect-[21/9] md:rounded-xl"
        captionClassName="px-4 md:px-0"
      />
    </div>
  );

  return (
    <>
      <article className="mx-auto w-full max-w-[1200px] px-4 pt-4 pb-12 md:px-16 md:pt-8 md:pb-16">
        <div className="hidden md:block">
          <Breadcrumb
            items={[
              { label: t("breadcrumbRoot") },
              activity.area
                ? { label: activity.area.name, href: `/sicilia/${activity.area.slug}` }
                : { label: provinceName(activity.placeProvince), href: `/luoghi/${activity.placeSlug}` },
              { label: activity.title },
            ]}
          />
        </div>

        {avviso === "non-prenotabile" && (
          <p role="status" className="mt-4 rounded-md bg-coccio-tint px-4 py-3 text-body">
            {t("notBookable")}
          </p>
        )}

        {/* Su mobile la foto apre la pagina, a tutta larghezza */}
        <div className="-mt-4 md:hidden">{photo}</div>

        <header className="mt-6 flex flex-col gap-4 md:mt-4">
          {activity.tags.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {activity.tags.map((tag) => {
                const domain = interestDomain(tag.key);
                return (
                  <li key={tag.key} className={domain ? `is-tag is-tag--${domain}` : "is-tag"}>
                    <span className="is-tag__dot" />
                    {labels.get(tag.key) ?? tag.key}
                  </li>
                );
              })}
            </ul>
          )}
          <h1 className="is-display max-w-4xl text-display-l">{activity.title}</h1>
          {/* Su desktop Condividi sta a destra dei metadati; Salva arriva con il builder (M5). */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <p className="text-body text-lava-muted">{meta.join(" · ")}</p>
            <div className="hidden flex-wrap items-start gap-3 md:flex">
              <ShareButton title={activity.title} />
            </div>
          </div>
        </header>

        <div className="mt-8 hidden md:block">{photo}</div>

        <div className="mt-10 grid gap-10 md:grid-cols-12 md:gap-12">
          <div className="flex flex-col gap-10 md:col-span-7">
            {/* Consiglio locale prima di "Cosa ti aspetta", come nei mockup ("Perché è per te" arriva con la M4) */}
            {tip && <CatalogLocalTip tip={tip} locale={locale} />}
            {activity.description && (
              <section aria-labelledby="cosa-aspetta">
                <h2 id="cosa-aspetta" className="is-display text-heading-2">
                  {t("whatToExpect")}
                </h2>
                <p className="mt-3 text-body-l text-pretty">{activity.description}</p>
              </section>
            )}
            {offers.length > 0 && (
              <section aria-labelledby="prenota-online" className="md:hidden">
                <h2 id="prenota-online" className="is-display text-heading-2">
                  {t("bookOnline")}
                </h2>
                <div className="mt-4 flex flex-col gap-4">{offerList}</div>
              </section>
            )}
          </div>

          <aside className="hidden md:col-span-5 md:block">
            <div className="sticky top-6 flex flex-col gap-4">
              <div className="rounded-lg border border-card-edge bg-calce-raised p-6 shadow-card">
                <h2 className="text-body-s font-semibold">{t("addToTrip")}</h2>
                <div className="mt-3">
                  <ButtonLink href={`/viaggi/aggiungi?attivita=${activity.slug}`} variant="primary" className="w-full">
                    {t("addToTrip")}
                  </ButtonLink>
                </div>
              </div>
              {offerList}
            </div>
          </aside>
        </div>

        {itineraries.length > 0 && (
          <section aria-labelledby="stesso-itinerario" className="mt-16">
            <h2 id="stesso-itinerario" className="is-display text-heading-1">
              {t("sameItinerary")}
            </h2>
            <ul className="mt-6 flex flex-col divide-y divide-divider">
              {itineraries.map((itinerary) => (
                <li key={itinerary.slug} className="flex flex-wrap items-baseline justify-between gap-2 py-4">
                  <Link href={`/itinerari/${itinerary.slug}`} className="text-body-l font-semibold text-lava underline-offset-4 hover:underline">
                    {itinerary.title}
                  </Link>
                  <span className="text-body-s text-lava-muted">{t("days", { count: itinerary.days })}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-16">
          <ReviewsSection
            activityId={activity.id}
            reviews={reviewState.reviews}
            mine={reviewState.mine ? { rating: reviewState.mine.rating, body: reviewState.mine.body ?? "" } : null}
            eligible={reviewState.eligible}
            viewer={viewer}
          />
        </div>

        {nearby.length > 0 && (
          <section aria-labelledby="stessa-giornata" className="mt-16 hidden md:block">
            <h2 id="stessa-giornata" className="is-display text-heading-1">
              {t("sameDay")}
            </h2>
            <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {nearby.map((a) => (
                <li key={a.id}>
                  <CatalogActivityCard activity={a} locale={locale} interestLabels={labels} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <JsonLd
          data={breadcrumbList(
            [
              { name: t("breadcrumbRoot"), path: "/" },
              activity.area
                ? { name: activity.area.name, path: `/sicilia/${activity.area.slug}` }
                : { name: provinceName(activity.placeProvince), path: `/luoghi/${activity.placeSlug}` },
              { name: activity.title, path: `/attivita/${activity.slug}` },
            ],
            locale,
          )}
        />
        <JsonLd
          data={touristAttraction({
            name: activity.title,
            description: activity.description,
            path: `/attivita/${activity.slug}`,
            locale,
            placeName: activity.placeName,
            province: activity.placeProvince,
            latitude: activity.placeLat,
            longitude: activity.placeLng,
            isFree: activity.onSitePriceEur !== null && Number(activity.onSitePriceEur) === 0,
          })}
        />
      </article>

      {/* Mobile: la barra di prenotazione sostituisce la TabBar, con l'offerta principale */}
      <BookingBar
        addToTrip={
          <ButtonLink href={`/viaggi/aggiungi?attivita=${activity.slug}`} variant="primary" className="w-full">
            {t("addToTrip")}
          </ButtonLink>
        }
        offer={
          mainOffer ? (
            <ButtonAnchor
              variant="secondary"
              href={affiliateHref(mainOffer.id, { locale })}
              rel="sponsored nofollow"
            >
              {/* Due righe come nel mockup: il partner e il prezzo "da". */}
              <span className="flex flex-col items-center gap-0.5 leading-tight">
                <span>{mainOffer.partner}</span>
                {mainOffer.price && (
                  <span className="text-caption font-normal">{t("offerBarPrice", { price: mainOffer.price })}</span>
                )}
              </span>
            </ButtonAnchor>
          ) : undefined
        }
      />
    </>
  );
}
