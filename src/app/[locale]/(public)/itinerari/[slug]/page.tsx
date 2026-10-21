import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CoverFigure } from "@/components/catalog/cover-figure";
import { ItineraryDays, type Day, type DayStop } from "@/components/catalog/itinerary-days";
import { JsonLd } from "@/components/catalog/json-ld";
import { ShareButton } from "@/components/catalog/share-button";
import { ActionBar, ButtonLink } from "@/components/design";
import { formatDuration } from "@/lib/format";
import { consecutiveLegPairs } from "@/lib/maps/legs";
import { assignStopPhotos } from "@/lib/itinerary-photos";
import { coverThumbUrl, type CoverMedia } from "@/lib/media";
import { canonicalFor } from "@/lib/seo";
import { breadcrumbList, touristTrip } from "@/lib/structured-data";
import { getTemplate } from "@/server/catalog/queries";
import { listTipsFor } from "@/server/catalog/tips";
import { getLegs } from "@/server/maps/legs";

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
    alternates: canonicalFor(locale, `/itinerari/${itinerary.slug}`),
    openGraph: { title: itinerary.title, description, type: "article" },
  };
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

  // Una foto per tappa, senza ripetizioni in tutto l'itinerario (docs/IMMAGINI.md): copertina propria
  // dell'attività → del luogo → dell'area. La copertina in cima alla pagina è riservata: non compare anche su una tappa.
  const stopPhotos = assignStopPhotos(
    itinerary.items.map((item) => ({
      key: item.id,
      chain: [item.activityCover?.id ?? null, item.placeCover?.id ?? null, item.areaCover?.id ?? null],
    })),
    new Set(itinerary.cover ? [itinerary.cover.media.id] : []),
  );
  const mediaById = new Map<string, CoverMedia>();
  for (const item of itinerary.items) {
    for (const cover of [item.activityCover, item.placeCover, item.areaCover]) {
      if (cover) mediaById.set(cover.id, cover);
    }
  }
  const thumbFor = (itemId: string): string | null => {
    const id = stopPhotos.get(itemId) ?? null;
    const cover = id === null ? undefined : mediaById.get(id);
    return cover ? coverThumbUrl(cover) : null;
  };

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
      thumbUrl: thumbFor(item.id),
      durationMin: item.activityDurationMin,
      // Coordinate del luogo della tappa, per la mappa del giorno (6.2).
      lat: item.lat,
      lng: item.lng,
      placeId: item.placeId,
      tip: item === tipItem ? tipFor(item) : null,
    }));
    return {
      name: itinerary.dayTitles[day]?.trim() || places.join(t("dayPlacesJoiner")),
      intro: itinerary.dayIntros[day]?.trim() || null,
      night: night ? nightName(night) : null,
      stops,
    };
  });

  // Tratte stradali tra le tappe consecutive di ogni giorno (place_legs; le mancanti sono "in calcolo").
  const legs = await getLegs(days.flatMap((day) => consecutiveLegPairs(day.stops.map((stop) => stop.placeId))));

  const areaNames = itinerary.facts.areas.map(areaName);
  const firstPlace = itinerary.items.find((i) => i.placeName);
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

        <ItineraryDays days={days} legs={legs} />

        {itinerary.tips.length > 0 && (
          // Stessa superficie di LocalTip (is-localtip): decisione del 2026-10-21, vedi docs/design/components/LocalTip/README.md.
          <aside aria-labelledby="itinerary-tips-title" className="is-localtip max-w-[680px]">
            <span id="itinerary-tips-title" className="is-localtip__label">
              {t("tipsTitle")}
            </span>
            {itinerary.tips.map((tip) => (
              <p key={tip} className="is-localtip__text">
                {tip}
              </p>
            ))}
            <div className="is-byline">
              <span className="is-byline__photo" aria-hidden="true">
                {tDesign("editorialMonogram")}
              </span>
              <div>
                <div className="is-byline__name">{tDesign("editorial")}</div>
              </div>
            </div>
          </aside>
        )}

        <JsonLd
          data={breadcrumbList(
            [
              { name: t("breadcrumbRoot"), path: "/" },
              { name: itinerary.title, path: `/itinerari/${itinerary.slug}` },
            ],
            locale,
          )}
        />
        <JsonLd
          data={touristTrip({
            name: itinerary.title,
            description: itinerary.description ?? itinerary.subtitle ?? null,
            path: `/itinerari/${itinerary.slug}`,
            locale,
            stops: listed.flatMap(({ item, name }) =>
              item.activitySlug
                ? [{ name, path: `/attivita/${item.activitySlug}` }]
                : item.placeSlug
                  ? [{ name, path: `/luoghi/${item.placeSlug}` }]
                  : [],
            ),
          })}
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
