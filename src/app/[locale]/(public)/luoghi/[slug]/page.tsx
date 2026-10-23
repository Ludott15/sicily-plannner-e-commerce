import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Breadcrumb } from "@/components/catalog/breadcrumb";
import { CatalogActivityCard } from "@/components/catalog/catalog-activity-card";
import { CoverFigure } from "@/components/catalog/cover-figure";
import { ItineraryCard } from "@/components/catalog/itinerary-card";
import { JsonLd } from "@/components/catalog/json-ld";
import { ShareButton } from "@/components/catalog/share-button";
import { TripMap } from "@/components/design";
import type { MapPoint } from "@/components/design/map/map-style";
import { TerritoryProducts } from "@/components/shop/territory-products";
import { Link } from "@/lib/i18n/navigation";
import { provinceName } from "@/lib/provinces";
import { canonicalFor, truncate } from "@/lib/seo";
import { breadcrumbList, place as placeJsonLd } from "@/lib/structured-data";
import { interestLabels } from "@/server/catalog/labels";
import { getPlace, listTemplatesThroughPlace, nearbyActivities } from "@/server/catalog/queries";
import { productsForPlace } from "@/server/shop/queries";

// Pagina di un luogo: nessun mockup dedicato, stessa struttura della scheda attività
// (percorso, foto, titolo, "Cosa ti aspetta") seguita dalle attività del luogo e dagli
// itinerari pronti che ci passano. "Sulla mappa" (6.2): le attività vicine, con la mappa e l'elenco
// dei link. Consigli locali e prodotti della zona arrivano con i dati.

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const place = await getPlace(slug, locale);
  if (!place) return {};

  const t = await getTranslations({ locale, namespace: "Catalog" });
  const description = truncate(place.description) ?? t("placeDescription", { place: place.name });
  return {
    title: t("activitiesIn", { place: place.name }),
    description,
    alternates: canonicalFor(locale, `/luoghi/${place.slug}`),
    openGraph: { title: place.name, description },
  };
}

export default async function PlacePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const place = await getPlace(slug, locale);
  if (!place) notFound();

  const [t, tMap, labels, templates, nearby, territoryProducts] = await Promise.all([
    getTranslations("Catalog"),
    getTranslations("Map"),
    interestLabels(locale),
    listTemplatesThroughPlace(place.id),
    nearbyActivities(place.id),
    productsForPlace(place.id, locale),
  ]);
  const distanceFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const nearbyPoints: MapPoint[] = nearby.map((a) => ({ id: a.id, lat: a.lat, lng: a.lng, label: a.title }));
  // Le attività di questo luogo sono già elencate sopra: qui i link vanno solo ai luoghi vicini.
  const elsewhere = nearby.filter((a) => a.placeId !== place.id);

  return (
    <article className="mx-auto w-full max-w-[1200px] px-4 pt-4 pb-12 md:px-16 md:pt-8 md:pb-16">
      <div className="hidden md:block">
        <Breadcrumb
          items={[
            { label: t("breadcrumbRoot") },
            place.area
              ? { label: place.area.name, href: `/sicilia/${place.area.slug}` }
              : { label: provinceName(place.province) },
            { label: place.name },
          ]}
        />
      </div>

      <div className="-mx-4 -mt-4 md:mx-0 md:mt-4">
        <CoverFigure
          cover={place.cover}
          ratio="16x9"
          sizes="(min-width: 1200px) 1072px, (min-width: 768px) calc(100vw - 128px), 100vw"
          locale={locale}
          placeholder={place.name}
          priority
          frameClassName="aspect-[4/3] md:aspect-[21/9] md:rounded-xl"
          captionClassName="px-4 md:px-0"
        />
      </div>

      <header className="mt-6 flex flex-col gap-4">
        <p className="text-label uppercase text-lava-muted">{t("province", { province: provinceName(place.province) })}</p>
        <h1 className="is-display text-display-l">{place.name}</h1>
        <div>
          <ShareButton title={place.name} />
        </div>
      </header>

      {place.description && (
        <section aria-labelledby="cosa-aspetta" className="mt-10 max-w-3xl">
          <h2 id="cosa-aspetta" className="is-display text-heading-2">
            {t("whatToExpect")}
          </h2>
          <p className="mt-3 text-body-l text-pretty">{place.description}</p>
        </section>
      )}

      <section aria-labelledby="attivita-luogo" className="mt-16">
        <h2 id="attivita-luogo" className="is-display text-heading-1">
          {t("activitiesIn", { place: place.name })}
        </h2>
        {place.activities.length === 0 ? (
          <p className="mt-4 text-body-l text-lava-muted">{t("noActivities")}</p>
        ) : (
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {place.activities.map((activity) => (
              <li key={activity.id}>
                <CatalogActivityCard activity={activity} locale={locale} interestLabels={labels} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <TerritoryProducts id="dal-territorio-luogo" products={territoryProducts} locale={locale} />

      {nearby.length > 0 && (
        <section aria-labelledby="sulla-mappa" className="mt-16">
          <h2 id="sulla-mappa" className="is-display text-heading-1">
            {tMap("placeTitle")}
          </h2>
          <p className="mt-3 max-w-[680px] text-body text-lava-muted">{tMap("placeIntro")}</p>
          <div
            className={
              elsewhere.length > 0
                ? "mt-6 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)] md:items-start"
                : "mt-6"
            }
          >
            <TripMap points={nearbyPoints} ariaLabel={tMap("placeMapLabel", { place: place.name })} listed={false} />
            {elsewhere.length > 0 && (
              <ul aria-label={tMap("placeListLabel")} className="flex flex-col divide-y divide-divider">
                {elsewhere.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1 py-4">
                    <Link href={`/attivita/${a.slug}`} className="text-body-l font-semibold text-lava underline-offset-4 hover:underline">
                      {a.title}
                    </Link>
                    <span className="text-body-s text-lava-muted">
                      {a.placeName} · {tMap("placeDistance", { km: distanceFormat.format(a.distanceKm) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {templates.length > 0 && (
        <section aria-labelledby="itinerari-luogo" className="mt-16">
          <h2 id="itinerari-luogo" className="is-display text-heading-1">
            {t("itinerariesThrough")}
          </h2>
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((it) => (
              <li key={it.id}>
                <ItineraryCard itinerary={it} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <JsonLd
        data={breadcrumbList(
          [
            { name: t("breadcrumbRoot"), path: "/" },
            ...(place.area ? [{ name: place.area.name, path: `/sicilia/${place.area.slug}` }] : []),
            { name: place.name, path: `/luoghi/${place.slug}` },
          ],
          locale,
        )}
      />
      <JsonLd
        data={placeJsonLd({
          name: place.name,
          description: place.description,
          path: `/luoghi/${place.slug}`,
          locale,
          province: place.province,
          latitude: place.lat,
          longitude: place.lng,
        })}
      />
    </article>
  );
}
