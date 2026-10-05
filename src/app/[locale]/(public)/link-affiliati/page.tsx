import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TextPage, TextSection } from "@/components/layout/text-page";
import { Link } from "@/lib/i18n/navigation";
import { localizedAlternates } from "@/lib/seo";

// Come funzionano i link affiliati: descrive il comportamento reale del sito (offerte che
// nominano il partner, /api/go con subid, prenotazione sul sito del partner). Non è un testo
// legale: privacy e cookie hanno le loro pagine.
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Affiliates" });
  return { title: t("title"), description: t("intro"), alternates: localizedAlternates(locale, "/link-affiliati") };
}

export default async function AffiliateLinksPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Affiliates");

  return (
    <TextPage title={t("title")} intro={t("intro")}>
      <TextSection id="commissione" title={t("commissionTitle")}>
        <p>{t("commissionText")}</p>
      </TextSection>
      <TextSection id="partner" title={t("partnerTitle")}>
        <p>{t("partnerText")}</p>
      </TextSection>
      <TextSection id="prenotazione" title={t("bookingTitle")}>
        <p>{t("bookingText")}</p>
      </TextSection>
      <TextSection id="click" title={t("clickTitle")}>
        <p>
          {t.rich("clickText", {
            privacy: (chunks) => <Link href="/privacy">{chunks}</Link>,
          })}
        </p>
      </TextSection>
    </TextPage>
  );
}
