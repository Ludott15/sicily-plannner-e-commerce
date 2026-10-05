import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Breadcrumb } from "@/components/catalog/breadcrumb";
import { CatalogActivityCard } from "@/components/catalog/catalog-activity-card";
import { CatalogLocalTip } from "@/components/catalog/catalog-local-tip";
import { JsonLd } from "@/components/catalog/json-ld";
import { ShareButton } from "@/components/catalog/share-button";
import {
  AffiliateOffer,
  affiliateHref,
  BookingBar,
  ButtonAnchor,
  interestDomain,
  PendingButton,
} from "@/components/design";
import { publicEnv } from "@/lib/env";
import { formatDuration, formatEur, formatSeason } from "@/lib/format";
import { provinceName } from "@/lib/provinces";
import { localizedAlternates, truncate } from "@/lib/seo";
import { interestLabels } from "@/server/catalog/labels";
import { partnerName, type Partner } from "@/server/affiliates/links";
import { getActivity, listActivityOffers, listNearbyActivities } from "@/server/catalog/queries";
import { getActivityTip } from "@/server/catalog/tips";

// Scheda attività (mockup Attivita.html e AttivitaMobile.html).
// Non ancora in pagina, perché mancano dati o funzioni: galleria (una sola foto o il
// segnaposto), "Perché è per te" (M4), "Da sapere",
// recensioni (M9), prodotti della zona (M10), "+10 punti con il check-in" (M9).
// In sospeso (visibili e disabilitate): Salva e "Aggiungi al viaggio" (M5).
// Offerte: prodotti dei partner (activity_offers), dalla più economica; la prima è anche
// nella barra mobile. Il prezzo dell'attività è quello pagato in loco (ingresso, biglietto),
// un metadato e mai un'offerta. Senza offerte non c'è né AffiliateOffer né offerta nella barra.

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ avviso?: string }>;
};

export async function generateMetadata({ params }: Omit<Props, "searchParams">): Promise<Metadata> {
  const { locale, slug } = await params;
  const activity = await getActivity(slug);
  if (!activity) return {};

  const description = truncate(activity.description) ?? `${activity.title} · ${activity.placeName}`;
  return {
    title: `${activity.title} · ${activity.placeName}`,
    description,
    alternates: localizedAlternates(locale, `/attivita/${activity.slug}`),
    openGraph: { title: activity.title, description, type: "article" },
  };
}

export default async function ActivityPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const activity = await getActivity(slug);
  if (!activity) notFound();

  const [t, labels, nearby, offerRows, tip, { avviso }] = await Promise.all([
    getTranslations("Catalog"),
    interestLabels(locale),
    listNearbyActivities(activity.id, activity.placeId, activity.placeProvince),
    listActivityOffers(activity.id),
    getActivityTip(activity.id, activity.placeId),
    searchParams,
  ]);

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
  const url = `${publicEnv.NEXT_PUBLIC_SITE_URL}/${locale}/attivita/${activity.slug}`;

  // Metadati del titolo: numeri concreti, compreso il prezzo in loco.
  const meta = [
    formatDuration(activity.durationMin),
    activity.requiresCar ? t("carNeeded") : null,
    price !== null ? (Number(activity.onSitePriceEur) === 0 ? t("freeMeta") : t("priceMeta", { price })) : null,
    season,
    activity.accessible ? t("accessible") : null,
  ].filter((m): m is string => Boolean(m));

  const photo = (
    <div className="relative -mx-4 aspect-[4/3] overflow-hidden bg-calce-sunk md:mx-0 md:aspect-[21/9] md:rounded-xl">
      {activity.placeCoverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={activity.placeCoverImage} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="is-display absolute bottom-4 left-4 text-heading-2 text-lava-muted" aria-hidden="true">
          {activity.placeName}
        </span>
      )}
    </div>
  );

  return (
    <>
      <article className="mx-auto w-full max-w-[1200px] px-4 pt-4 pb-12 md:px-16 md:pt-8 md:pb-16">
        <div className="hidden md:block">
          <Breadcrumb
            items={[
              { label: t("breadcrumbRoot") },
              { label: provinceName(activity.placeProvince), href: `/luoghi/${activity.placeSlug}` },
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
          <p className="text-body text-lava-muted">
            {meta.join(" · ")}
          </p>
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
                  <PendingButton id="activity.add-to-trip" variant="primary" fullWidth>
                    {t("addToTrip")}
                  </PendingButton>
                </div>
              </div>
              {offerList}
            </div>
          </aside>
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
          data={{
            "@context": "https://schema.org",
            "@type": "TouristAttraction",
            name: activity.title,
            description: activity.description ?? undefined,
            url,
            isAccessibleForFree: Number(activity.onSitePriceEur) === 0,
            ...(activity.rating !== null && {
              aggregateRating: { "@type": "AggregateRating", ratingValue: activity.rating, bestRating: 5 },
            }),
            location: {
              "@type": "Place",
              name: activity.placeName,
              address: { "@type": "PostalAddress", addressRegion: activity.placeProvince, addressCountry: "IT" },
              geo: { "@type": "GeoCoordinates", latitude: activity.placeLat, longitude: activity.placeLng },
            },
          }}
        />
      </article>

      {/* Mobile: la barra di prenotazione sostituisce la TabBar, con l'offerta principale */}
      <BookingBar
        addToTrip={
          <PendingButton id="activity.add-to-trip" variant="primary" fullWidth>
            {t("addToTrip")}
          </PendingButton>
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
