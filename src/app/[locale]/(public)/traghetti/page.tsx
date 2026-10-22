import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DateField, Select } from "@/components/design";
import { VerticalExtras } from "@/components/verticals/vertical-extras";
import { VerticalField, VerticalForm } from "@/components/verticals/vertical-form";
import { VerticalNotices, VerticalResult, type SummaryItem } from "@/components/verticals/vertical-result";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { FERRY_PORT_CODES, ferryPortName } from "@/lib/ferries/ports";
import { canonicalFor } from "@/lib/seo";
import {
  countParam,
  formatIsoDate,
  isoParam,
  oneOfParam,
  paramOf,
  queryString,
  type ParamValue,
} from "@/lib/verticals/search-params";
import { activePartners, publishedGuides, searchOutcome } from "@/server/affiliates/vertical-page-data";
import { VERTICAL_PAGE, VERTICAL_PARTNERS } from "@/server/affiliates/vertical-links";
import { VERTICAL_PARTNER } from "@/server/affiliates/partners";

// Traghetti (verticale ferry): porto di partenza e di arrivo dalla lista chiusa, data e passeggeri.
// Predefinito Ferryhopper, alternativa Directferries.

const PAGE = VERTICAL_PAGE.ferry;
const MAX_PASSENGERS = 20;
const DEFAULT_PASSENGERS = 2;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, ParamValue>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Ferries" });
  return {
    title: t("title"),
    description: t("intro"),
    alternates: canonicalFor(locale, `/${PAGE}`),
  };
}

export default async function FerriesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tVert, query, partners] = await Promise.all([
    getTranslations("Ferries"),
    getTranslations("Verticals"),
    searchParams,
    activePartners("ferry"),
  ]);

  const from = oneOfParam(query.da, FERRY_PORT_CODES);
  const to = oneOfParam(query.a, FERRY_PORT_CODES);
  const date = isoParam(query.data);
  const passengers = countParam(query.passeggeri, DEFAULT_PASSENGERS, MAX_PASSENGERS);
  const partner = oneOfParam(query.partner, VERTICAL_PARTNERS.ferry) || VERTICAL_PARTNER.ferry;
  const sameStop = from !== "" && from === to;
  const ready = from !== "" && to !== "" && !sameStop && date !== "";

  const outcome = ready
    ? await searchOutcome(
        { vertical: "ferry", from, to, date, adults: passengers, partner },
        { context: "page", itineraryId: null, locale },
      )
    : null;

  const summary: SummaryItem[] = [];
  if (from) summary.push({ label: tVert("fieldFrom"), value: ferryPortName(from, locale) });
  if (to) summary.push({ label: tVert("fieldTo"), value: ferryPortName(to, locale) });
  if (date) summary.push({ label: tVert("fieldDate"), value: formatIsoDate(date, locale) });
  if (from || to || date) summary.push({ label: tVert("fieldAdults"), value: String(passengers) });

  const placeLabel: string | undefined = from && to ? `${ferryPortName(from, locale)} - ${ferryPortName(to, locale)}` : undefined;
  const hint = sameStop ? tVert("sameStop") : t("pick");

  const current = { da: from, a: to, data: date, passeggeri: String(passengers) };
  const alternatives = partners
    .filter((p) => p.partner !== partner)
    .map((p) => ({ name: p.name, href: queryString({ ...current, partner: p.partner }) }));

  const tips = [t("tip1"), t("tip2"), t("tip3")];
  const faq = [
    { question: t("faq1q"), answer: t("faq1a") },
    { question: t("faq2q"), answer: t("faq2a") },
    { question: t("faq3q"), answer: t("faq3a") },
  ];
  const guides = await publishedGuides(locale, ["isole-minori-della-sicilia", "sicilia-senza-auto"]);
  const portOptions = FERRY_PORT_CODES.map((code) => ({ value: code, label: ferryPortName(code, locale) }));

  return (
    <PageContainer width="work">
      <PageHeader
        title={t("title")}
        subtitle={t("intro")}
        breadcrumb={[{ label: tVert("servicesCrumb"), href: "/servizi" }]}
        breadcrumbLabel={tVert("servicesLabel")}
      />

      <VerticalNotices avviso={paramOf(query.avviso)} />

      <VerticalForm submitLabel={t("submit")} hidden={{ partner: partner === VERTICAL_PARTNER.ferry ? "" : partner }}>
        <VerticalField label={t("fromLabel")}>
          <Select
            name="da"
            label={t("fromLabel")}
            options={portOptions}
            defaultValue={from || undefined}
            placeholder={t("placeholder")}
            required
          />
        </VerticalField>
        <VerticalField label={t("toLabel")}>
          <Select
            name="a"
            label={t("toLabel")}
            options={portOptions}
            defaultValue={to || undefined}
            placeholder={t("placeholder")}
            required
          />
        </VerticalField>
        <VerticalField label={t("dateLabel")} htmlFor="data">
          <DateField id="data" name="data" defaultValue={date} label={t("dateLabel")} placeholder={t("dateLabel")} />
        </VerticalField>
        <VerticalField label={t("adultsLabel")} htmlFor="passeggeri">
          <input
            id="passeggeri"
            name="passeggeri"
            type="number"
            min={1}
            max={MAX_PASSENGERS}
            defaultValue={passengers}
            className="is-field min-h-11 w-full px-3 text-body"
          />
        </VerticalField>
      </VerticalForm>

      <VerticalResult summary={summary} outcome={outcome} hint={hint} placeName={placeLabel} />

      <VerticalExtras tips={tips} faq={faq} guides={guides} alternatives={alternatives} />
    </PageContainer>
  );
}
