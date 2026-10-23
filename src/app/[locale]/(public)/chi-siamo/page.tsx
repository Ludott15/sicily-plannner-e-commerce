import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/layout/legal-page";
import { isLegalReady } from "@/lib/legal-entity";
import { canonicalFor } from "@/lib/seo";

// Chi siamo: il progetto, la redazione che firma i consigli e il fondatore. Il testo è in
// content/legal/chi-siamo.it.md (come le pagine legali); senza dati del titolare è noindex.
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "About" });
  return { title: t("title"), alternates: canonicalFor(locale, "/chi-siamo"), robots: { index: isLegalReady() } };
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("About");
  return <LegalPage doc="chi-siamo" title={t("title")} />;
}
