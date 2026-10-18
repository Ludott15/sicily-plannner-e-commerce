import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

// Conferma dopo l'eliminazione dell'account o dei dati dell'ospite (passo 8.2): la sessione è già
// chiusa dal server. Pagina di servizio: non indicizzata.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AccountDeleted" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AccountDeletedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("AccountDeleted");

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        subtitle={t("text")}
        primaryAction={
          <ButtonLink href="/" variant="primary">
            {t("home")}
          </ButtonLink>
        }
      />
    </PageContainer>
  );
}
