import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContactForm } from "@/components/contact/contact-form";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { legalEntity } from "@/lib/legal-entity";
import { canonicalFor } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Contact" });
  return { title: t("title"), alternates: canonicalFor(locale, "/contatti") };
}

// Contatti: modulo con Turnstile. L'indirizzo di assistenza compare solo se configurato
// (dati del titolare): altrimenti resta il modulo, che funziona da solo.
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Contact");
  const supportEmail = legalEntity()?.supportEmail ?? null;

  return (
    <PageContainer>
      <PageHeader title={t("title")} subtitle={t("intro")} />
      {supportEmail && (
        <p className="text-body text-lava-muted">
          {t("supportLine")}{" "}
          <a href={`mailto:${supportEmail}`} className="font-semibold text-coccio-text underline underline-offset-4">
            {supportEmail}
          </a>
        </p>
      )}
      <div className="max-w-xl">
        <ContactForm locale={locale} />
      </div>
    </PageContainer>
  );
}
