import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { JsonLd } from "@/components/catalog/json-ld";
import { publicEnv } from "@/lib/env";
import { formatDuration } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { localizedAlternates } from "@/lib/seo";
import { getTemplate } from "@/server/catalog/queries";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const itinerary = await getTemplate(slug);
  if (!itinerary?.slug) return {};

  const t = await getTranslations({ locale, namespace: "Catalog" });
  const description = t("itineraryDescription", { days: t("days", { count: itinerary.days }) });
  return {
    title: itinerary.title,
    description,
    alternates: localizedAlternates(locale, `/itinerari/${itinerary.slug}`),
    openGraph: { title: itinerary.title, description, type: "article" },
  };
}

export default async function ItineraryPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const itinerary = await getTemplate(slug);
  if (!itinerary) notFound();

  const t = await getTranslations("Catalog");
  const days = Array.from({ length: itinerary.days }, (_, day) => ({
    day,
    items: itinerary.items.filter((item) => item.dayIndex === day),
  }));
  const base = publicEnv.NEXT_PUBLIC_SITE_URL;

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10">
      <p className="text-sm text-muted-foreground">{t("days", { count: itinerary.days })}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">{itinerary.title}</h1>

      <ol className="mt-8 flex flex-col gap-8">
        {days.map(({ day, items }) => (
          <li key={day}>
            <h2 className="text-lg font-semibold">{t("day", { n: day + 1 })}</h2>
            <ol className="mt-3 flex flex-col gap-2 border-l pl-4">
              {items.map((item) => (
                <li key={item.id} className="text-sm">
                  {item.startTime && (
                    <span className="mr-2 tabular-nums text-muted-foreground">{item.startTime.slice(0, 5)}</span>
                  )}
                  {item.activitySlug ? (
                    <Link href={`/attivita/${item.activitySlug}`} className="font-medium hover:underline">
                      {item.activityTitle}
                    </Link>
                  ) : (
                    <span className="font-medium">{item.customTitle ?? item.placeName}</span>
                  )}
                  {item.placeName && item.activitySlug && item.placeSlug && (
                    <>
                      {" · "}
                      <Link href={`/luoghi/${item.placeSlug}`} className="text-muted-foreground hover:underline">
                        {item.placeName}
                      </Link>
                    </>
                  )}
                  {item.activityDurationMin !== null && (
                    <span className="text-muted-foreground"> · {formatDuration(item.activityDurationMin)}</span>
                  )}
                  {item.notes && <p className="mt-1 text-muted-foreground">{item.notes}</p>}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TouristTrip",
          name: itinerary.title,
          url: `${base}/${locale}/itinerari/${itinerary.slug}`,
          itinerary: {
            "@type": "ItemList",
            itemListElement: itinerary.items.map((item, i) => ({
              "@type": "ListItem",
              position: i + 1,
              item: item.activitySlug
                ? {
                    "@type": "TouristAttraction",
                    name: item.activityTitle,
                    url: `${base}/${locale}/attivita/${item.activitySlug}`,
                  }
                : { "@type": "Place", name: item.customTitle ?? item.placeName },
            })),
          },
        }}
      />
    </article>
  );
}
