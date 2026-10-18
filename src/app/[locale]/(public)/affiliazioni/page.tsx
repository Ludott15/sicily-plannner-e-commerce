import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TextPage, TextSection } from "@/components/layout/text-page";
import { Link } from "@/lib/i18n/navigation";
import { localizedAlternates } from "@/lib/seo";
import { listActivePartners } from "@/server/affiliates/public-partners";

// Pagina delle affiliazioni (passo 3.1, sostituisce /link-affiliati, che fa 308 qui). Come
// funzionano i link affiliati e l'elenco dei partner attivi, letto dalla tabella affiliate_partners
// (solo nome e verticali). Non è un testo legale: privacy e cookie hanno le loro pagine.
type Props = { params: Promise<{ locale: string }> };

const VERTICAL_KEYS = ["lodging", "car", "activity", "flight"] as const;
type VerticalKey = (typeof VERTICAL_KEYS)[number];

function isVerticalKey(value: string): value is VerticalKey {
  return (VERTICAL_KEYS as readonly string[]).includes(value);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Affiliates" });
  return { title: t("title"), description: t("intro"), alternates: localizedAlternates(locale, "/affiliazioni") };
}

export default async function AffiliationsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, partners] = await Promise.all([getTranslations("Affiliates"), listActivePartners()]);

  return (
    <TextPage title={t("title")} intro={t("intro")}>
      <TextSection id="commissione" title={t("commissionTitle")}>
        <p>{t("commissionText")}</p>
      </TextSection>
      <TextSection id="partner" title={t("partnerTitle")}>
        <p>{t("partnerText")}</p>
      </TextSection>
      <TextSection id="partner-attivi" title={t("activePartnersTitle")}>
        <p>{t("activePartnersIntro")}</p>
        {partners.length === 0 ? (
          <p>{t("activePartnersEmpty")}</p>
        ) : (
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {partners.map((p) => (
              <li key={p.partner}>
                <span className="font-semibold">{p.name}</span>
                {p.verticals.filter(isVerticalKey).length > 0 && (
                  <span className="text-lava-muted">
                    {" · "}
                    {p.verticals
                      .filter(isVerticalKey)
                      .map((v) => t(`verticalName.${v}`))
                      .join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
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
