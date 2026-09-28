import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ItineraryDays, type Day } from "@/components/catalog/itinerary-days";
import { JsonLd } from "@/components/catalog/json-ld";
import { ShareButton } from "@/components/catalog/share-button";
import { ActionBar, PendingButton } from "@/components/design";
import { publicEnv } from "@/lib/env";
import { formatDuration } from "@/lib/format";
import { localizedAlternates } from "@/lib/seo";
import { getTemplate } from "@/server/catalog/queries";

// Itinerario pronto (mockup ItinerarioProntoMobile.html; su desktop la struttura di
// Itinerario.html senza le parti di gruppo). Non ancora in pagina: trasferimenti tra le tappe
// e chilometri (servono le distanze), consiglio locale (schema 2e), "Cosa prenotare" (schema 2e
// e milestone 6), mappa. "Usa questo itinerario" è in sospeso fino al builder (M5).

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

  const [t, tDesign] = await Promise.all([getTranslations("Catalog"), getTranslations("Design")]);

  // Nome del giorno: il titolo editoriale; senza titolo, i luoghi delle tappe di quel giorno.
  const days: Day[] = Array.from({ length: itinerary.days }, (_, day) => {
    const items = itinerary.items.filter((item) => item.dayIndex === day);
    const places = [...new Set(items.flatMap((i) => (i.placeName ? [i.placeName] : [])))];
    return {
      name: itinerary.dayTitles[day]?.trim() || places.join(" e "),
      stops: items.map((item) => ({
        id: item.id,
        time: item.startTime ? item.startTime.slice(0, 5).replace(/^0/, "") : null,
        title: item.activityTitle ?? item.customTitle ?? item.placeName ?? "",
        href: item.activitySlug ? `/attivita/${item.activitySlug}` : item.placeSlug ? `/luoghi/${item.placeSlug}` : null,
        meta:
          [item.activitySlug ? item.placeName : null, item.activityDurationMin ? formatDuration(item.activityDurationMin) : null]
            .filter(Boolean)
            .join(" · ") || item.notes,
        durationMin: item.activityDurationMin,
      })),
    };
  });

  const stops = itinerary.items.length;
  const inCar = itinerary.items.some((i) => i.requiresCar);
  const firstPlace = itinerary.items.find((i) => i.placeName);
  const base = publicEnv.NEXT_PUBLIC_SITE_URL;

  return (
    <>
      <article className="mx-auto w-full max-w-[1200px] px-4 pt-4 pb-12 md:px-16 md:pt-12 md:pb-16">
        {/* Su mobile la foto apre la pagina, come nel mockup */}
        <div className="relative -mx-4 -mt-4 aspect-[4/3] overflow-hidden bg-calce-sunk md:hidden">
          {firstPlace?.placeCoverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={firstPlace.placeCoverImage} alt="" className="h-full w-full object-cover" />
          ) : (
            firstPlace?.placeName && (
              <span className="is-display absolute bottom-4 left-4 text-heading-2 text-lava-muted" aria-hidden="true">
                {firstPlace.placeName}
              </span>
            )
          )}
        </div>

        <header className="mt-6 flex flex-col gap-4 md:mt-0">
          <p className="text-label uppercase text-lava-muted">
            {t("readyEyebrow", { days: t("days", { count: itinerary.days }) })}
          </p>
          <h1 className="is-display max-w-4xl text-display-l">{itinerary.title}</h1>
          <p className="text-body text-lava-muted">
            {[inCar ? t("inCar") : null, t("stops", { count: stops })].filter(Boolean).join(" · ")}
          </p>
          <div className="is-byline">
            <span className="is-byline__photo bg-ink text-on-ink" aria-hidden="true">
              {tDesign("editorialMonogram")}
            </span>
            <span className="text-body-s text-lava">{t.rich("curatedBy", { b: (chunks) => <b>{chunks}</b> })}</span>
          </div>
          <div className="hidden flex-wrap items-start gap-3 md:flex">
            <PendingButton id="itinerary.use" variant="primary">
              {t("useItinerary")}
            </PendingButton>
            <ShareButton title={itinerary.title} />
          </div>
        </header>

        <div className="mt-8">
          <ItineraryDays days={days} />
        </div>

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
                  ? { "@type": "TouristAttraction", name: item.activityTitle, url: `${base}/${locale}/attivita/${item.activitySlug}` }
                  : { "@type": "Place", name: item.customTitle ?? item.placeName },
              })),
            },
          }}
        />
      </article>

      {/* Mobile: barra fissa con l'azione principale e Condividi, al posto della TabBar */}
      <ActionBar>
        <div className="flex-1">
          <PendingButton id="itinerary.use" variant="primary" fullWidth>
            {t("useItinerary")}
          </PendingButton>
        </div>
        <ShareButton title={itinerary.title} iconOnly />
      </ActionBar>
    </>
  );
}
