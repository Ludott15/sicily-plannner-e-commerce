import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/layout/legal-page";
import { isLegalReady } from "@/lib/legal-entity";
import { canonicalFor } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

// Indicizzabile solo con i dati del titolare: finché mancano, la pagina è noindex (vedi LegalPage).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Legal" });
  return { title: t("cookie"), alternates: canonicalFor(locale, "/cookie"), robots: { index: isLegalReady() } };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Legal");
  return <LegalPage doc="cookie" title={t("cookie")} />;
}
