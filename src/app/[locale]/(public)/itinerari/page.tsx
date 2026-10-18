import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ItineraryCard } from "@/components/catalog/itinerary-card";
import { TemplateFilters } from "@/components/catalog/template-filters";
import { ButtonLink } from "@/components/design";
import { PageContainer } from "@/components/layout/page-container";
import { parseTemplateFilters, type TemplateSearchParams } from "@/lib/template-filters";
import { localizedAlternates } from "@/lib/seo";
import { listTemplateAreas, listTemplates } from "@/server/catalog/queries";

// Lista degli itinerari pronti: stesse card della home, con filtri per durata, zona, per chi e
// mese nell'URL (/itinerari?giorni=2-3|4-5&area=ovest&per=couple&mese=7). Stato vuoto con
// "Togli i filtri" quando i filtri non trovano nulla. Griglia di card con respiro: una colonna
// su mobile, due dalla soglia dei piccoli schermi, tre da desktop.

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<TemplateSearchParams> };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Catalog" });
  return {
    title: t("itinerariesTitle"),
    description: t("itinerariesDescription"),
    alternates: localizedAlternates(locale, "/itinerari"),
    openGraph: { title: t("itinerariesTitle"), description: t("itinerariesDescription") },
  };
}

export default async function ItinerariesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, areas, search] = await Promise.all([getTranslations("Catalog"), listTemplateAreas(), searchParams]);
  const filters = parseTemplateFilters(search, { areas: areas.map((area) => area.slug) });
  const filtered = filters.days.length > 0 || filters.area !== null || filters.party !== null || filters.month !== null;
  const templates = await listTemplates(filters);

  const areaOptions = areas.map((area) => ({ slug: area.slug, name: locale === "en" ? area.nameEn : area.nameIt }));

  return (
    <PageContainer width="wide" className="gap-8 md:gap-10">
      <header className="flex flex-col gap-3">
        <h1 id="titolo-itinerari" className="is-display text-display-l">
          {t("itinerariesTitle")}
        </h1>
        <p className="max-w-[680px] text-body-l text-lava-muted">{t("itinerariesDescription")}</p>
      </header>

      {(filtered || templates.length > 0) && <TemplateFilters areas={areaOptions} selected={filters} />}

      <div className="flex flex-col gap-10">
        <p role="status" className="text-body-s text-lava-muted">
          {t("templatesCount", { count: templates.length })}
        </p>

        {templates.length === 0 ? (
          filtered ? (
            <div className="flex flex-col items-start gap-4">
              <p className="text-body-l">{t("templatesFilteredEmpty")}</p>
              <ButtonLink href="/itinerari" variant="primary">
                {t("filterClear")}
              </ButtonLink>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-4">
              <p className="text-body-l">{t("itinerariesEmpty")}</p>
              <ButtonLink href="/attivita" variant="primary">
                {t("exploreActivities")}
              </ButtonLink>
            </div>
          )
        ) : (
          <ul aria-labelledby="titolo-itinerari" className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((itinerary) => (
              <li key={itinerary.id}>
                <ItineraryCard itinerary={itinerary} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
