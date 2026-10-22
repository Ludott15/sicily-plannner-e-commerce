import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DateField, Select } from "@/components/design";
import { VerticalExtras } from "@/components/verticals/vertical-extras";
import { VerticalField, VerticalForm } from "@/components/verticals/vertical-form";
import { VerticalNotices, VerticalResult, type SummaryItem } from "@/components/verticals/vertical-result";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { canonicalFor } from "@/lib/seo";
import { TRAIN_CITY_CODES, trainCityName } from "@/lib/trains/cities";
import { formatIsoDate, isoParam, oneOfParam, paramOf, type ParamValue } from "@/lib/verticals/search-params";
import { publishedGuides, searchOutcome } from "@/server/affiliates/vertical-page-data";
import { VERTICAL_PAGE } from "@/server/affiliates/vertical-links";

// Treni e bus (verticale train): città di partenza e di arrivo dalla lista chiusa, data. Partner unico
// (Omio), quindi nessuna alternativa e nessun campo partner nel form.

const PAGE = VERTICAL_PAGE.train;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, ParamValue>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Trains" });
  return {
    title: t("title"),
    description: t("intro"),
    alternates: canonicalFor(locale, `/${PAGE}`),
  };
}

export default async function TrainsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tVert, query] = await Promise.all([getTranslations("Trains"), getTranslations("Verticals"), searchParams]);

  const from = oneOfParam(query.da, TRAIN_CITY_CODES);
  const to = oneOfParam(query.a, TRAIN_CITY_CODES);
  const date = isoParam(query.data);
  const sameStop = from !== "" && from === to;
  const ready = from !== "" && to !== "" && !sameStop && date !== "";

  const outcome = ready
    ? await searchOutcome({ vertical: "train", from, to, date }, { context: "page", itineraryId: null, locale })
    : null;

  const summary: SummaryItem[] = [];
  if (from) summary.push({ label: tVert("fieldFrom"), value: trainCityName(from, locale) });
  if (to) summary.push({ label: tVert("fieldTo"), value: trainCityName(to, locale) });
  if (date) summary.push({ label: tVert("fieldDate"), value: formatIsoDate(date, locale) });

  const placeLabel: string | undefined = from && to ? `${trainCityName(from, locale)} - ${trainCityName(to, locale)}` : undefined;
  const hint = sameStop ? tVert("sameStop") : t("pick");

  const cityOptions = TRAIN_CITY_CODES.map((code) => ({ value: code, label: trainCityName(code, locale) }));
  const tips = [t("tip1"), t("tip2"), t("tip3")];
  const faq = [
    { question: t("faq1q"), answer: t("faq1a") },
    { question: t("faq2q"), answer: t("faq2a") },
    { question: t("faq3q"), answer: t("faq3a") },
  ];
  const guides = await publishedGuides(locale, ["sicilia-senza-auto", "palermo-in-tre-giorni"]);

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
        <VerticalField label={t("fromLabel")}>
          <Select name="da" label={t("fromLabel")} options={cityOptions} defaultValue={from || undefined} placeholder={t("placeholder")} required />
        </VerticalField>
        <VerticalField label={t("toLabel")}>
          <Select name="a" label={t("toLabel")} options={cityOptions} defaultValue={to || undefined} placeholder={t("placeholder")} required />
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
