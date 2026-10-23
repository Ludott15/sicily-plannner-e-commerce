import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ACCESSIBILITY_CHECK } from "@/lib/accessibility";
import { legalEntity } from "@/lib/legal-entity";
import { canonicalFor } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Legal" });
  return { title: t("accessibility"), alternates: canonicalFor(locale, "/accessibilita") };
}

// Dichiarazione di accessibilità (WCAG 2.2 AA). Lo stato e i contenuti noti sono descritti qui; la
// data dell'ultima verifica e lo strumento vengono da ACCESSIBILITY_CHECK.
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Legal");
  const format = await getFormatter();
  // Il canale per le segnalazioni è l'indirizzo di assistenza dei dati del titolare, se configurato.
  const supportEmail = legalEntity()?.supportEmail ?? null;
  const date = format.dateTime(new Date(`${ACCESSIBILITY_CHECK.lastAutomatedCheck}T12:00:00Z`), {
    dateStyle: "long",
    timeZone: "Europe/Rome",
  });

  return (
    <PageContainer>
      <PageHeader eyebrow={t("eyebrow")} title={t("accessibility")} subtitle={t("accessibilityIntro")} />

      <section aria-labelledby="accessibilita-stato" className="flex flex-col gap-3">
        <h2 id="accessibilita-stato" className="is-display text-heading-2">
          {t("accessibilityStatusTitle")}
        </h2>
        <p className="text-body-l text-pretty">
          {t("accessibilityStatusText", { standard: ACCESSIBILITY_CHECK.standard })}
        </p>
      </section>

      <section aria-labelledby="accessibilita-metodo" className="flex flex-col gap-3">
        <h2 id="accessibilita-metodo" className="is-display text-heading-2">
          {t("accessibilityCheckTitle")}
        </h2>
        <p className="text-body-l text-pretty">
          {t("accessibilityCheckText", {
            date,
            tool: ACCESSIBILITY_CHECK.tool,
            standard: ACCESSIBILITY_CHECK.standard,
          })}
        </p>
      </section>

      <section aria-labelledby="accessibilita-noti" className="flex flex-col gap-3">
        <h2 id="accessibilita-noti" className="is-display text-heading-2">
          {t("accessibilityKnownTitle")}
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-body-l text-pretty">
          <li>{t("accessibilityKnownMap")}</li>
          <li>{t("accessibilityKnownPartners")}</li>
        </ul>
      </section>

      <section aria-labelledby="accessibilita-segnala" className="flex flex-col gap-3">
        <h2 id="accessibilita-segnala" className="is-display text-heading-2">
          {t("accessibilityContactTitle")}
        </h2>
        {supportEmail ? (
          <p className="text-body-l text-pretty">
            {t("accessibilityContactText")}{" "}
            <a href={`mailto:${supportEmail}`} className="font-semibold text-coccio-text underline underline-offset-4">
              {supportEmail}
            </a>
          </p>
        ) : (
          <p className="text-body-l text-pretty text-lava-muted">{t("accessibilityContactMissing")}</p>
        )}
      </section>
    </PageContainer>
  );
}
