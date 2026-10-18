import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CoverFigure } from "@/components/catalog/cover-figure";
import { ItineraryDays, type Day, type DayStop } from "@/components/catalog/itinerary-days";
import { JsonLd } from "@/components/catalog/json-ld";
import { ShareButton } from "@/components/catalog/share-button";
import { ActionBar, ButtonLink } from "@/components/design";
import { publicEnv } from "@/lib/env";
import { formatDuration } from "@/lib/format";
import { mediaUrl, variantPath, type CoverMedia } from "@/lib/media";
import { localizedAlternates } from "@/lib/seo";
import { getTemplate } from "@/server/catalog/queries";
import { listTipsFor } from "@/server/catalog/tips";

// Itinerario pronto (mockup ItinerarioProntoMobile.html; su desktop la foto sta accanto al testo).
// Hero: eyebrow, titolo, sottotitolo, autore, "Usa questo itinerario" e Condividi. Sotto, i fatti
// (giorni, aree, ritmo, auto, budget) in una riga divisa da filetti, non in un box. Poi giorni con
// intro, tappe con foto, fascia oraria e nota, e dove dormire. Niente mappa per ora: trasferimenti
// e chilometri arrivano con le distanze. "Usa questo itinerario" porta a /viaggio/salva (date e
// persone). Consiglio locale accanto alla tappa: al massimo uno per giorno, sulla prima tappa che
// ne ha uno (dell'attività o del suo luogo).

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const itinerary = await getTemplate(slug);
  if (!itinerary?.slug) return {};

  const t = await getTranslations({ locale, namespace: "Catalog" });
  const description = itinerary.subtitle ?? t("itineraryDescription", { days: t("days", { count: itinerary.days }) });
  return {
    title: itinerary.title,
    description,
    alternates: localizedAlternates(locale, `/itinerari/${itinerary.slug}`),
    openGraph: { title: itinerary.title, description, type: "article" },
  };
}

// Miniatura quadrata della tappa, dalla foto del luogo (o dall'illustrazione, che è un SVG).
function stopThumb(cover: CoverMedia | null): string | null {
  if (!cover) return null;
  if (cover.kind === "illustration" || cover.variantsVersion === 0) return mediaUrl(cover.storagePath);
  return mediaUrl(variantPath(cover.id, cover.variantsVersion, "1x1", 480, "webp"));
}

export default async function ItineraryPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const itinerary = await getTemplate(slug);
  if (!itinerary) notFound();

  const [t, tDesign, tips] = await Promise.all([
    getTranslations("Catalog"),
    getTranslations("Design"),
    listTipsFor(
      itinerary.items.flatMap((i) => (i.activityId ? [i.activityId] : [])),
      itinerary.items.flatMap((i) => (i.placeId ? [i.placeId] : [])),
    ),
  ]);
  const tipFor = (item: (typeof itinerary.items)[number]) =>
    tips.find((tip) => item.activityId && tip.activityId === item.activityId) ??
    tips.find((tip) => !tip.activityId && item.placeId && tip.placeId === item.placeId) ??
    null;

  const areaName = (area: { nameIt: string; nameEn: string }) => (locale === "en" ? area.nameEn : area.nameIt);
  const nightName = (night: { placeName: string | null; areaNameIt: string | null; areaNameEn: string | null }) =>
    night.placeName ?? (locale === "en" ? night.areaNameEn : night.areaNameIt) ?? null;

  // Nome del giorno: il titolo editoriale; senza titolo, i luoghi delle tappe di quel giorno.
  const days: Day[] = Array.from({ length: itinerary.days }, (_, day) => {
    const items = itinerary.items.filter((item) => item.dayIndex === day);
    const places = [...new Set(items.flatMap((i) => (i.placeName ? [i.placeName] : [])))];
    const tipItem = items.find((i) => tipFor(i));
    const night = itinerary.nights.find((n) => n.nightIndex === day + 1);
    const stops: DayStop[] = items.map((item) => ({
      id: item.id,
      time: item.timeSlot ? t(`slot.${item.timeSlot}`) : null,
      title: item.activityTitle ?? item.customTitle ?? item.placeName ?? "",
      href: item.activitySlug ? `/attivita/${item.activitySlug}` : item.placeSlug ? `/luoghi/${item.placeSlug}` : null,
      meta:
        [item.activitySlug ? item.placeName : null, item.activityDurationMin ? formatDuration(item.activityDurationMin) : null]
          .filter(Boolean)
          .join(" · ") || null,
      note: item.notes,
      thumbUrl: stopThumb(item.placeCover),
      durationMin: item.activityDurationMin,
      // Coordinate del luogo della tappa, per la mappa del giorno (6.2).
      lat: item.lat,
      lng: item.lng,
      tip: item === tipItem ? tipFor(item) : null,
    }));
    return {
      name: itinerary.dayTitles[day]?.trim() || places.join(t("dayPlacesJoiner")),
      intro: itinerary.dayIntros[day]?.trim() || null,
      night: night ? nightName(night) : null,
      stops,
    };
  });

  const areaNames = itinerary.facts.areas.map(areaName);
  const firstPlace = itinerary.items.find((i) => i.placeName);
  const base = publicEnv.NEXT_PUBLIC_SITE_URL;
  // Tappe con un nome: schema.org non accetta voci senza name.
  const listed = itinerary.items.flatMap((item) => {
    const name = item.activitySlug ? item.activityTitle : (item.customTitle ?? item.placeName);
    return name ? [{ item, name }] : [];
  });

  return (
    <>
      <article className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-4 pt-4 pb-12 md:gap-14 md:px-16 md:pt-12 md:pb-16">
        <div className="flex flex-col gap-8 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-14">
          {/* Mobile: la foto apre la pagina, come nel mockup. Desktop: a destra del testo. */}
          <div className="-mx-4 -mt-4 md:order-last md:mx-0 md:mt-0">
            <CoverFigure
              cover={itinerary.cover}
              ratio="16x9"
              sizes="(min-width: 768px) 50vw, 100vw"
              locale={locale}
              placeholder={firstPlace?.placeName ?? itinerary.title}
              priority
              frameClassName="aspect-[4/3]"
              captionClassName="px-4 md:px-0"
            />
          </div>

          <header className="flex flex-col gap-5">
            <p className="text-label uppercase text-lava-muted">
              {t("readyEyebrow", { days: t("days", { count: itinerary.days }) })}
            </p>
            <h1 className="is-display text-display-l text-balance">{itinerary.title}</h1>
            {itinerary.subtitle && <p className="max-w-[680px] text-body-l text-lava-muted">{itinerary.subtitle}</p>}
            <div className="is-byline">
              <span className="is-byline__photo bg-ink text-on-ink" aria-hidden="true">
                {tDesign("editorialMonogram")}
              </span>
              <span className="text-body-s text-lava">{t.rich("curatedBy", { b: (chunks) => <b>{chunks}</b> })}</span>
            </div>
            <div className="hidden flex-wrap items-center gap-3 pt-2 md:flex">
              <ButtonLink href={`/viaggio/salva?da=${itinerary.slug}`} variant="primary">
                {t("useItinerary")}
              </ButtonLink>
              <ShareButton title={itinerary.title} />
            </div>
          </header>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-6 border-y border-divider py-6 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <dt className="text-label uppercase text-lava-muted">{t("summaryDuration")}</dt>
            <dd className="is-display text-heading-3">{t("days", { count: itinerary.days })}</dd>
          </div>
          {areaNames.length > 0 && (
            <div className="flex flex-col gap-1">
              <dt className="text-label uppercase text-lava-muted">{t("summaryAreas")}</dt>
              <dd className="text-body">{areaNames.join(", ")}</dd>
            </div>
          )}
          {itinerary.pace && (
            <div className="flex flex-col gap-1">
              <dt className="text-label uppercase text-lava-muted">{t("summaryPace")}</dt>
              <dd className="text-body">{t(`paceLabel.${itinerary.pace}`)}</dd>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <dt className="text-label uppercase text-lava-muted">{t("summaryCar")}</dt>
            <dd className="text-body">{itinerary.facts.requiresCar ? t("carYes") : t("carNo")}</dd>
          </div>
          {itinerary.facts.budgetPerDayEur !== null && (
            <div className="flex flex-col gap-1">
              <dt className="text-label uppercase text-lava-muted">{t("summaryBudget")}</dt>
              <dd className="text-body">{t("budgetPerDay", { amount: itinerary.facts.budgetPerDayEur })}</dd>
            </div>
          )}
        </dl>

        {itinerary.description && (
          <p className="max-w-[680px] whitespace-pre-line text-body">{itinerary.description}</p>
        )}

        <ItineraryDays days={days} />

        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "TouristTrip",
            name: itinerary.title,
            description: itinerary.description ?? itinerary.subtitle ?? undefined,
            inLanguage: locale,
            url: `${base}/${locale}/itinerari/${itinerary.slug}`,
            itinerary: {
              "@type": "ItemList",
              itemListElement: listed.map(({ item, name }, i) => ({
                "@type": "ListItem",
                position: i + 1,
                item: item.activitySlug
                  ? { "@type": "TouristAttraction", name, url: `${base}/${locale}/attivita/${item.activitySlug}` }
                  : { "@type": "Place", name },
              })),
            },
          }}
        />
      </article>

      {/* Mobile: barra fissa con l'azione principale e Condividi, al posto della TabBar */}
      <ActionBar>
        <div className="flex-1">
          <ButtonLink href={`/viaggio/salva?da=${itinerary.slug}`} variant="primary" className="w-full">
            {t("useItinerary")}
          </ButtonLink>
        </div>
        <ShareButton title={itinerary.title} iconOnly />
      </ActionBar>
    </>
  );
}
