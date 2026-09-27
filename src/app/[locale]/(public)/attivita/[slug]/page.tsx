import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { JsonLd } from "@/components/catalog/json-ld";
import { TagList } from "@/components/catalog/tag-list";
import { publicEnv } from "@/lib/env";
import { formatDuration, formatEur, formatSeason } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { localizedAlternates, truncate } from "@/lib/seo";
import { interestLabels } from "@/server/catalog/labels";
import { getActivity } from "@/server/catalog/queries";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
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

export default async function ActivityPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const activity = await getActivity(slug);
  if (!activity) notFound();

  const [t, labels] = await Promise.all([getTranslations("Catalog"), interestLabels(locale)]);
  const price = formatEur(activity.priceFromEur, locale);
  const season = formatSeason(activity.seasonMonths, locale);
  const url = `${publicEnv.NEXT_PUBLIC_SITE_URL}/${locale}/attivita/${activity.slug}`;

  const facts: [string, string][] = [
    [t("duration"), formatDuration(activity.durationMin)],
    ...(price !== null
      ? [[t("price"), Number(activity.priceFromEur) === 0 ? t("free") : t("priceFrom", { price })] as [string, string]]
      : []),
    ...(activity.rating !== null ? [[t("rating"), t("ratingValue", { rating: activity.rating })] as [string, string]] : []),
    [t("season"), season ?? t("allYear")],
  ];

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10">
      <p className="text-sm text-muted-foreground">
        <Link href={`/luoghi/${activity.placeSlug}`} className="hover:underline">
          {activity.placeName}
        </Link>
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">{activity.title}</h1>

      <div className="mt-4">
        <TagList tags={activity.tags} labels={labels} />
      </div>

      {activity.description && <p className="mt-6 text-lg text-pretty">{activity.description}</p>}

      <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {(activity.requiresCar || activity.accessible) && (
        <ul className="mt-6 flex flex-wrap gap-2 text-sm">
          {activity.requiresCar && <li className="rounded-md border px-2 py-1">{t("requiresCar")}</li>}
          {activity.accessible && <li className="rounded-md border px-2 py-1">{t("accessible")}</li>}
        </ul>
      )}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TouristAttraction",
          name: activity.title,
          description: activity.description ?? undefined,
          url,
          isAccessibleForFree: Number(activity.priceFromEur) === 0,
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
  );
}
