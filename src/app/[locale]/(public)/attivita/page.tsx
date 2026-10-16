import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActivityFilters } from "@/components/catalog/activity-filters";
import { CatalogActivityCard } from "@/components/catalog/catalog-activity-card";
import { JsonLd } from "@/components/catalog/json-ld";
import { ButtonLink, interestDomain } from "@/components/design";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { parseActivityFilters, type ActivitySearchParams } from "@/lib/activity-filters";
import { publicEnv } from "@/lib/env";
import { provinceName } from "@/lib/provinces";
import { localizedAlternates } from "@/lib/seo";
import { interestLabels } from "@/server/catalog/labels";
import { listActivities, listActivityFilterOptions } from "@/server/catalog/queries";

// Lista delle attività: intestazione di pagina, filtri compatti (interessi e provincia) e griglia di
// ActivityCard. Filtri nell'URL (?interessi=sea,food_wine&provincia=TP): la lista filtrata la
// renderizza il server, il canonical resta la lista completa.
// Stato vuoto (schemi.md): una frase che dice cosa fare e un'azione.

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ActivitySearchParams & { avviso?: string }>;
};

export async function generateMetadata({ params }: Omit<Props, "searchParams">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Catalog" });
  return {
    title: t("activitiesTitle"),
    description: t("activitiesDescription"),
    alternates: localizedAlternates(locale, "/attivita"),
    openGraph: { title: t("activitiesTitle"), description: t("activitiesDescription") },
  };
}

export default async function ActivitiesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tVert, labels, options, search] = await Promise.all([
    getTranslations("Catalog"),
    getTranslations("Verticals"),
    interestLabels(locale),
    listActivityFilterOptions(),
    searchParams,
  ]);
  const filters = parseActivityFilters(search, options);
  const filtered = filters.interests.length > 0 || filters.province !== null;
  const activities = await listActivities(filters.interests, filters.province);

  return (
    <PageContainer width="wide">
      <PageHeader title={t("activitiesTitle")} subtitle={t("activitiesDescription")} />

      {search.avviso === "troppi-click" && (
        <p role="alert" className="rounded-lg border border-card-edge bg-calce-raised p-4 text-body">
          {tVert("rateLimited")}
        </p>
      )}

      {options.interests.length + options.provinces.length > 0 && (
        <ActivityFilters
          interests={options.interests.map((key) => ({ key, label: labels.get(key) ?? key, domain: interestDomain(key) }))}
          provinces={options.provinces.map((code) => ({ code, name: provinceName(code) }))}
          selected={filters}
        />
      )}

      <div className="flex flex-col gap-6">
        <p role="status" className="text-body-s text-lava-muted">
          {t("activitiesCount", { count: activities.length })}
        </p>

        {activities.length === 0 ? (
          filtered ? (
            <div className="flex flex-col items-start gap-4">
              <p className="text-body-l">{t("activitiesFilteredEmpty")}</p>
              <ButtonLink href="/attivita" variant="primary">
                {t("filterClear")}
              </ButtonLink>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-4">
              <p className="text-body-l">{t("activitiesEmpty")}</p>
              <ButtonLink href="/itinerari" variant="primary">
                {t("itinerariesTitle")}
              </ButtonLink>
            </div>
          )
        ) : (
          <ul aria-label={t("activitiesTitle")} className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {activities.map((activity) => (
              <li key={activity.id}>
                <CatalogActivityCard activity={activity} locale={locale} interestLabels={labels} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: t("activitiesTitle"),
          itemListElement: activities.map((a, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${publicEnv.NEXT_PUBLIC_SITE_URL}/${locale}/attivita/${a.slug}`,
            name: a.title,
          })),
        }}
      />
    </PageContainer>
  );
}
