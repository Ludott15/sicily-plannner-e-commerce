import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Breadcrumb } from "@/components/catalog/breadcrumb";
import { CatalogActivityCard } from "@/components/catalog/catalog-activity-card";
import { ItineraryCard } from "@/components/catalog/itinerary-card";
import { JsonLd } from "@/components/catalog/json-ld";
import { ShareButton } from "@/components/catalog/share-button";
import { publicEnv } from "@/lib/env";
import { provinceName } from "@/lib/provinces";
import { localizedAlternates, truncate } from "@/lib/seo";
import { interestLabels } from "@/server/catalog/labels";
import { getPlace, listTemplatesThroughPlace } from "@/server/catalog/queries";

// Pagina di un luogo: nessun mockup dedicato, stessa struttura della scheda attività
// (percorso, foto, titolo, "Cosa ti aspetta") seguita dalle attività del luogo e dagli
// itinerari pronti che ci passano. Consigli locali e prodotti della zona arrivano con i dati.

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const place = await getPlace(slug);
  if (!place) return {};

  const t = await getTranslations({ locale, namespace: "Catalog" });
  const description = truncate(place.description) ?? t("placeDescription", { place: place.name });
  return {
    title: t("activitiesIn", { place: place.name }),
    description,
    alternates: localizedAlternates(locale, `/luoghi/${place.slug}`),
    openGraph: { title: place.name, description },
  };
}

export default async function PlacePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const place = await getPlace(slug);
  if (!place) notFound();

  const [t, labels, templates] = await Promise.all([
    getTranslations("Catalog"),
    interestLabels(locale),
    listTemplatesThroughPlace(place.id),
  ]);

  return (
    <article className="mx-auto w-full max-w-[1200px] px-4 pt-4 pb-12 md:px-16 md:pt-8 md:pb-16">
      <div className="hidden md:block">
        <Breadcrumb items={[{ label: t("breadcrumbRoot") }, { label: provinceName(place.province) }, { label: place.name }]} />
      </div>

      <div className="relative -mx-4 -mt-4 aspect-[4/3] overflow-hidden bg-calce-sunk md:mx-0 md:mt-4 md:aspect-[21/9] md:rounded-xl">
        {place.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={place.coverImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="is-display absolute bottom-4 left-4 text-heading-2 text-lava-muted" aria-hidden="true">
            {place.name}
          </span>
        )}
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
        data={{
          "@context": "https://schema.org",
          "@type": "TouristDestination",
          name: place.name,
          description: place.description ?? undefined,
          url: `${publicEnv.NEXT_PUBLIC_SITE_URL}/${locale}/luoghi/${place.slug}`,
          geo: { "@type": "GeoCoordinates", latitude: place.lat, longitude: place.lng },
          address: { "@type": "PostalAddress", addressRegion: place.province, addressCountry: "IT" },
          includesAttraction: place.activities.map((a) => ({
            "@type": "TouristAttraction",
            name: a.title,
            url: `${publicEnv.NEXT_PUBLIC_SITE_URL}/${locale}/attivita/${a.slug}`,
          })),
        }}
      />
    </article>
  );
}
