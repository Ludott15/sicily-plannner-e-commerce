import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Select } from "@/components/design";
import { VerticalExtras } from "@/components/verticals/vertical-extras";
import { VerticalField, VerticalForm } from "@/components/verticals/vertical-form";
import { VerticalNotices, VerticalResult, type SummaryItem } from "@/components/verticals/vertical-result";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { canonicalFor } from "@/lib/seo";
import { paramOf, type ParamValue } from "@/lib/verticals/search-params";
import { listVerticalPlaces, publishedGuides, searchOutcome } from "@/server/affiliates/vertical-page-data";
import { VERTICAL_PAGE } from "@/server/affiliates/vertical-links";

// Deposito bagagli (verticale luggage): città dal catalogo. Partner unico (Radical Storage).

const PAGE = VERTICAL_PAGE.luggage;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, ParamValue>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Luggage" });
  return {
    title: t("title"),
    description: t("intro"),
    alternates: canonicalFor(locale, `/${PAGE}`),
  };
}

export default async function LuggagePage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tVert, query, places] = await Promise.all([
    getTranslations("Luggage"),
    getTranslations("Verticals"),
    searchParams,
    listVerticalPlaces(locale),
  ]);

  const slug = paramOf(query.luogo);
  const picked = places.find((p) => p.slug === slug) ?? null;

  const outcome = picked
    ? await searchOutcome({ vertical: "luggage", place: picked.slug }, { context: "page", itineraryId: null, locale })
    : null;

  const summary: SummaryItem[] = picked ? [{ label: tVert("fieldPlace"), value: picked.name }] : [];
  const placeLabel: string | undefined = picked?.name;
  const hint = t("pick");

  const tips = [t("tip1"), t("tip2"), t("tip3")];
  const faq = [
    { question: t("faq1q"), answer: t("faq1a") },
    { question: t("faq2q"), answer: t("faq2a") },
    { question: t("faq3q"), answer: t("faq3a") },
  ];
  const guides = await publishedGuides(locale, ["palermo-in-tre-giorni", "sicilia-senza-auto"]);

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
        <VerticalField label={t("placeLabel")} wide>
          <Select
            name="luogo"
            label={t("placeLabel")}
            options={places.map((p) => ({ value: p.slug, label: p.name, description: p.areaName }))}
            defaultValue={picked?.slug}
            placeholder={t("placePlaceholder")}
            required
          />
        </VerticalField>
      </VerticalForm>

      <VerticalResult summary={summary} outcome={outcome} hint={hint} placeName={placeLabel} />

      <VerticalExtras tips={tips} faq={faq} guides={guides} alternatives={[]} />
    </PageContainer>
  );
}
