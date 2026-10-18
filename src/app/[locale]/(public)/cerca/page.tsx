import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { SearchResults } from "@/components/search/search-results";
import { SiteSearch } from "@/components/search/site-search";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { canonicalFor } from "@/lib/seo";
import { recordSearchMiss } from "@/server/search/misses";
import { searchSite } from "@/server/search/queries";

// Ricerca a pagina intera (passo 11.2): risultati completi per tipo, stato vuoto con proposte
// dai link che esistono già. Non si indicizza: la versione utile è la pagina del contenuto.
// Una ricerca senza risultati si registra in forma anonima per l'admin (testo e conteggio, niente utente).

const RESULTS_PER_KIND = 10;
const MIN_LENGTH_TO_RECORD = 2;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

function queryParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Search" });
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: true },
    alternates: canonicalFor(locale, "/cerca"),
    openGraph: { title: t("title"), description: t("description") },
  };
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = queryParam((await searchParams).q);

  const [t, tNav, results] = await Promise.all([
    getTranslations("Search"),
    getTranslations("Nav"),
    searchSite(query, locale, RESULTS_PER_KIND),
  ]);

  if (results.total === 0 && query.length >= MIN_LENGTH_TO_RECORD) {
    // Statistica per l'admin: un errore di scrittura non deve far cadere la pagina.
    try {
      await recordSearchMiss(query, await headers());
    } catch {
      // ignorato di proposito: la ricerca resta utilizzabile anche senza registro.
    }
  }

  return (
    <PageContainer width="wide">
      <PageHeader title={t("title")} subtitle={t("description")} />

      <SiteSearch variant="page" initialQuery={query} autoFocus />

      {query.length > 0 && results.total > 0 ? (
        <SearchResults query={query} total={results.total} groups={results.groups} />
      ) : (
        <section aria-labelledby="search-empty-title" className="flex flex-col items-start gap-6">
          <div className="flex flex-col gap-2">
            <h2 id="search-empty-title" className="text-heading-3">
              {query.length > 0 ? t("emptyTitle", { query }) : t("emptyPrompt")}
            </h2>
            <p className="text-body text-lava-muted">{t("emptyBody")}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/itinerari" variant="secondary">
              {tNav("itineraries")}
            </ButtonLink>
            <ButtonLink href="/attivita" variant="secondary">
              {tNav("activities")}
            </ButtonLink>
            <ButtonLink href="/guide" variant="secondary">
              {tNav("guides")}
            </ButtonLink>
          </div>
        </section>
      )}
    </PageContainer>
  );
}
