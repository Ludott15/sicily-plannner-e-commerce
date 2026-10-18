import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { PageContainer } from "@/components/layout/page-container";

// Pagina "Sei offline" (passo 11.3): il service worker la mostra quando manca la rete e la pagina
// richiesta non è in cache. Il contenuto non contiene dati dell'utente; noindex.
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Pwa.offlinePage" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function OfflinePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Pwa.offlinePage");

  return (
    <PageContainer width="prose" className="flex-1 justify-center py-16">
      <header className="flex flex-col gap-3">
        <h1 className="is-display text-display-l">{t("title")}</h1>
        <p className="text-body-l text-pretty text-lava-muted">{t("text")}</p>
      </header>
      <div>
        <ButtonLink href="/viaggi" variant="secondary">
          {t("trips")}
        </ButtonLink>
      </div>
    </PageContainer>
  );
}
