import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/layout/legal-page";
import { isLegalReady } from "@/lib/legal-entity";
import { canonicalFor } from "@/lib/seo";

// Regolamento dei punti: linkato da /punti (account) e dalla classifica. Stesso testo legale
// delle altre pagine: noindex finché mancano i dati del titolare.
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Points" });
  return { title: t("rulesLink"), alternates: canonicalFor(locale, "/punti/regolamento"), robots: { index: isLegalReady() } };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Points");
  return <LegalPage doc="regolamento-punti" title={t("rulesLink")} />;
}
