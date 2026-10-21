import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DateField, Select } from "@/components/design";
import { VerticalExtras } from "@/components/verticals/vertical-extras";
import { VerticalField, VerticalForm } from "@/components/verticals/vertical-form";
import { VerticalNotices, VerticalResult, type SummaryItem } from "@/components/verticals/vertical-result";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { SICILY_AIRPORT_CODES } from "@/lib/flights/airports";
import { canonicalFor } from "@/lib/seo";
import { formatIsoDate, isoParam, oneOfParam, paramOf, type ParamValue } from "@/lib/verticals/search-params";
import { listVerticalPlaces, publishedGuides, searchOutcome } from "@/server/affiliates/vertical-page-data";
import { carAirports } from "@/server/affiliates/verticals";
import { VERTICAL_PAGE } from "@/server/affiliates/vertical-links";

// Transfer dall'aeroporto (verticale transfer): aeroporto siciliano, destinazione dal catalogo e data.
// Partner unico (Welcome Pickups).

const PAGE = VERTICAL_PAGE.transfer;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, ParamValue>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Transfers" });
  return {
    title: t("title"),
    description: t("intro"),
    alternates: canonicalFor(locale, `/${PAGE}`),
  };
}

export default async function TransferPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tVert, query, places] = await Promise.all([
    getTranslations("Transfers"),
    getTranslations("Verticals"),
    searchParams,
    listVerticalPlaces(locale),
  ]);
  const airports = carAirports(locale);

  const airport = oneOfParam(query.aeroporto, SICILY_AIRPORT_CODES);
  const pickedAirport = airports.find((a) => a.iata === airport) ?? null;
  const placeSlug = paramOf(query.destinazione);
  const pickedPlace = places.find((p) => p.slug === placeSlug) ?? null;
  const date = isoParam(query.data);
  const ready = pickedAirport !== null && pickedPlace !== null && date !== "";

  const outcome = ready
    ? await searchOutcome(
        { vertical: "transfer", airport: pickedAirport.iata, place: pickedPlace.slug, date },
        { context: "page", itineraryId: null, locale },
      )
    : null;

  const summary: SummaryItem[] = [];
  if (pickedAirport) summary.push({ label: tVert("fieldAirport"), value: pickedAirport.name });
  if (pickedPlace) summary.push({ label: tVert("fieldDestination"), value: pickedPlace.name });
  if (date) summary.push({ label: tVert("fieldDate"), value: formatIsoDate(date, locale) });

  const placeLabel: string | undefined = pickedPlace?.name;
  const hint = t("pick");

  const tips = [t("tip1"), t("tip2"), t("tip3")];
  const faq = [
    { question: t("faq1q"), answer: t("faq1a") },
    { question: t("faq2q"), answer: t("faq2a") },
    { question: t("faq3q"), answer: t("faq3a") },
  ];
  const guides = await publishedGuides(locale, ["prima-volta-in-sicilia", "sicilia-senza-auto"]);

  return (
    <PageContainer width="work">
      <PageHeader
        title={t("title")}
        subtitle={t("intro")}
        breadcrumb={[{ label: tVert("servicesCrumb"), href: "/servizi" }]}
        breadcrumbLabel={tVert("servicesLabel")}
      />

      <VerticalNotices avviso={paramOf(query.avviso)} />

      <VerticalForm submitLabel={t("submit")}>
        <VerticalField label={t("airportLabel")}>
          <Select
            name="aeroporto"
            label={t("airportLabel")}
            options={airports.map((a) => ({ value: a.iata, label: `${a.name} (${a.iata})` }))}
            defaultValue={pickedAirport?.iata}
            placeholder={t("airportPlaceholder")}
            required
          />
        </VerticalField>
        <VerticalField label={t("placeLabel")}>
          <Select
            name="destinazione"
            label={t("placeLabel")}
            options={places.map((p) => ({ value: p.slug, label: p.name, description: p.areaName }))}
            defaultValue={pickedPlace?.slug}
            placeholder={t("placePlaceholder")}
            required
          />
        </VerticalField>
        <VerticalField label={t("dateLabel")} htmlFor="data">
          <DateField id="data" name="data" defaultValue={date} label={t("dateLabel")} placeholder={t("dateLabel")} />
        </VerticalField>
      </VerticalForm>

      <VerticalResult summary={summary} outcome={outcome} hint={hint} placeName={placeLabel} />

      <VerticalExtras tips={tips} faq={faq} guides={guides} alternatives={[]} />
    </PageContainer>
  );
}
