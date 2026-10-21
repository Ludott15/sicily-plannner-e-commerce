import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { VerticalExtras } from "@/components/verticals/vertical-extras";
import { VerticalNotices, VerticalResult } from "@/components/verticals/vertical-result";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { canonicalFor } from "@/lib/seo";
import { paramOf, type ParamValue } from "@/lib/verticals/search-params";
import { publishedGuides, searchOutcome } from "@/server/affiliates/vertical-page-data";
import { VERTICAL_PAGE } from "@/server/affiliates/vertical-links";

// eSIM (verticale esim): nessun campo di ricerca. Il pulsante va al partner (Airalo) con il link firmato.

const PAGE = VERTICAL_PAGE.esim;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, ParamValue>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Esim" });
  return {
    title: t("title"),
    description: t("intro"),
    alternates: canonicalFor(locale, `/${PAGE}`),
  };
}

export default async function EsimPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tVert, query] = await Promise.all([getTranslations("Esim"), getTranslations("Verticals"), searchParams]);

  const outcome = await searchOutcome({ vertical: "esim" }, { context: "page", itineraryId: null, locale });

  const tips = [t("tip1"), t("tip2"), t("tip3")];
  const faq = [
    { question: t("faq1q"), answer: t("faq1a") },
    { question: t("faq2q"), answer: t("faq2a") },
    { question: t("faq3q"), answer: t("faq3a") },
  ];
  const guides = await publishedGuides(locale, ["prima-volta-in-sicilia"]);

  return (
    <PageContainer width="work">
      <PageHeader
        title={t("title")}
        subtitle={t("intro")}
        breadcrumb={[{ label: tVert("servicesCrumb"), href: "/servizi" }]}
        breadcrumbLabel={tVert("servicesLabel")}
      />

      <VerticalNotices avviso={paramOf(query.avviso)} />

      <VerticalResult summary={[]} outcome={outcome} hint="" />

      <VerticalExtras tips={tips} faq={faq} guides={guides} alternatives={[]} />
    </PageContainer>
  );
}
