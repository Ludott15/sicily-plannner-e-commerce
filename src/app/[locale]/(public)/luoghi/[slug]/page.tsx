import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActivityCard } from "@/components/catalog/activity-card";
import { JsonLd } from "@/components/catalog/json-ld";
import { publicEnv } from "@/lib/env";
import { localizedAlternates, truncate } from "@/lib/seo";
import { interestLabels } from "@/server/catalog/labels";
import { getPlace } from "@/server/catalog/queries";

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

  const [t, labels] = await Promise.all([getTranslations("Catalog"), interestLabels(locale)]);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10">
      <p className="text-sm text-muted-foreground">{t("province", { province: place.province })}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{place.name}</h1>
      {place.description && <p className="mt-3 max-w-2xl text-lg text-pretty">{place.description}</p>}

      <h2 className="mt-10 text-xl font-semibold">{t("activitiesIn", { place: place.name })}</h2>
      {place.activities.length === 0 ? (
        <p className="mt-4 text-muted-foreground">{t("noActivities")}</p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {place.activities.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} locale={locale} interestLabels={labels} />
          ))}
        </ul>
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
    </section>
  );
}
