import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DateField, Select } from "@/components/design";
import { VerticalExtras } from "@/components/verticals/vertical-extras";
import { VerticalField, VerticalForm } from "@/components/verticals/vertical-form";
import { VerticalNotices, VerticalResult, type SummaryItem } from "@/components/verticals/vertical-result";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { canonicalFor } from "@/lib/seo";
import { isoParam, oneOfParam, paramOf, queryString, rangeOk, formatIsoDate, type ParamValue } from "@/lib/verticals/search-params";
import { SICILY_AIRPORT_CODES } from "@/lib/flights/airports";
import { activePartners, publishedGuides, searchOutcome } from "@/server/affiliates/vertical-page-data";
import { carAirports } from "@/server/affiliates/verticals";
import { VERTICAL_PAGE, VERTICAL_PARTNERS } from "@/server/affiliates/vertical-links";
import { VERTICAL_PARTNER } from "@/server/affiliates/partners";

// Noleggio auto (verticale car): aeroporto siciliano, date di ritiro e riconsegna. Il link firmato va a
// DiscoverCars (predefinito); Rentalcars è l'alternativa nella stessa pagina.

const PAGE = VERTICAL_PAGE.car;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, ParamValue>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Cars" });
  return {
    title: t("title"),
    description: t("intro"),
    alternates: canonicalFor(locale, `/${PAGE}`),
  };
}

export default async function CarRentalPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tVert, query, partners] = await Promise.all([
    getTranslations("Cars"),
    getTranslations("Verticals"),
    searchParams,
    activePartners("car"),
  ]);
  const airports = carAirports(locale);

  const airport = oneOfParam(query.aeroporto, SICILY_AIRPORT_CODES);
  const checkin = isoParam(query.checkin);
  const checkout = isoParam(query.checkout);
  const partner = oneOfParam(query.partner, VERTICAL_PARTNERS.car) || VERTICAL_PARTNER.car;
  const datesOk = rangeOk(checkin, checkout);
  const picked = airports.find((a) => a.iata === airport) ?? null;

  const outcome =
    picked && datesOk
      ? await searchOutcome(
          { vertical: "car", airport: picked.iata, checkin, checkout, partner },
          { context: "page", itineraryId: null, locale },
        )
      : null;

  const summary: SummaryItem[] = [];
  if (picked) summary.push({ label: tVert("fieldAirport"), value: picked.name });
  if (checkin) summary.push({ label: tVert("fieldPickup"), value: formatIsoDate(checkin, locale) });
  if (checkout) summary.push({ label: tVert("fieldDropoff"), value: formatIsoDate(checkout, locale) });

  const placeLabel: string | undefined = picked?.name;
  const hint = picked ? t("needDates") : t("pickAirport");

  const current = { aeroporto: airport, checkin, checkout };
  const alternatives = partners
    .filter((p) => p.partner !== partner)
    .map((p) => ({ name: p.name, href: queryString({ ...current, partner: p.partner }) }));

  const tips = [t("tip1"), t("tip2"), t("tip3")];
  const faq = [
    { question: t("faq1q"), answer: t("faq1a") },
    { question: t("faq2q"), answer: t("faq2a") },
    { question: t("faq3q"), answer: t("faq3a") },
  ];
  const guides = await publishedGuides(locale, ["sicilia-senza-auto", "prima-volta-in-sicilia"]);

  return (
    <PageContainer width="work">
      <PageHeader
        title={t("title")}
        subtitle={t("intro")}
        breadcrumb={[{ label: tVert("servicesCrumb"), href: "/servizi" }]}
        breadcrumbLabel={tVert("servicesLabel")}
      />

      <VerticalNotices avviso={paramOf(query.avviso)} />

      <VerticalForm submitLabel={t("submit")} hidden={{ partner: partner === VERTICAL_PARTNER.car ? "" : partner }}>
        <VerticalField label={t("airportLabel")} wide>
          <Select
            name="aeroporto"
            label={t("airportLabel")}
            options={airports.map((a) => ({ value: a.iata, label: t("airportOption", { name: a.name, city: a.city, iata: a.iata }) }))}
            defaultValue={picked?.iata}
            placeholder={t("airportPlaceholder")}
            required
          />
        </VerticalField>
        <VerticalField label={t("pickup")} htmlFor="checkin">
          <DateField id="checkin" name="checkin" defaultValue={checkin} label={t("pickup")} placeholder={t("pickup")} />
        </VerticalField>
        <VerticalField label={t("dropoff")} htmlFor="checkout">
          <DateField id="checkout" name="checkout" defaultValue={checkout} label={t("dropoff")} placeholder={t("dropoff")} />
        </VerticalField>
      </VerticalForm>

      <VerticalResult summary={summary} outcome={outcome} hint={hint} placeName={placeLabel} />

      <VerticalExtras tips={tips} faq={faq} guides={guides} alternatives={alternatives} />
    </PageContainer>
  );
}
