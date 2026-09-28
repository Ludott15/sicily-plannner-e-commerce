import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActivityFilters } from "@/components/catalog/activity-filters";
import { CatalogActivityCard } from "@/components/catalog/catalog-activity-card";
import { JsonLd } from "@/components/catalog/json-ld";
import { ButtonLink, interestDomain } from "@/components/design";
import { parseActivityFilters, type ActivitySearchParams } from "@/lib/activity-filters";
import { publicEnv } from "@/lib/env";
import { provinceName } from "@/lib/provinces";
import { localizedAlternates } from "@/lib/seo";
import { interestLabels } from "@/server/catalog/labels";
import { listActivities, listActivityFilterOptions } from "@/server/catalog/queries";

// Lista delle attività: griglia di ActivityCard, come le sezioni a card dei mockup.
// Filtri per interesse e provincia nell'URL (?interessi=sea,food_wine&provincia=TP): la
// lista filtrata la renderizza il server, il canonical resta la lista completa.
// Stato vuoto (schemi.md): una frase che dice cosa fare e un'azione.

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<ActivitySearchParams> };

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

  const [t, labels, options, search] = await Promise.all([
    getTranslations("Catalog"),
    interestLabels(locale),
    listActivityFilterOptions(),
    searchParams,
  ]);
  const filters = parseActivityFilters(search, options);
  const filtered = filters.interests.length > 0 || filters.province !== null;
  const activities = await listActivities(filters.interests, filters.province);

  return (
    <section className="mx-auto w-full max-w-[1200px] px-4 py-12 md:px-16 md:py-16">
      <h1 id="titolo-attivita" className="is-display text-display-l">
        {t("activitiesTitle")}
      </h1>
      <p className="mt-3 max-w-2xl text-body-l text-lava-muted">{t("activitiesDescription")}</p>

      {options.interests.length + options.provinces.length > 0 && (
        <ActivityFilters
          interests={options.interests.map((key) => ({ key, label: labels.get(key) ?? key, domain: interestDomain(key) }))}
          provinces={options.provinces.map((code) => ({ code, name: provinceName(code) }))}
          selected={filters}
        />
      )}

      <p role="status" className="mt-8 text-body-s text-lava-muted">
        {t("activitiesCount", { count: activities.length })}
      </p>

      {activities.length === 0 ? (
        filtered ? (
          <div className="mt-6 flex flex-col items-start gap-4">
            <p className="text-body-l">{t("activitiesFilteredEmpty")}</p>
            <ButtonLink href="/attivita" variant="primary">
              {t("filterClear")}
            </ButtonLink>
          </div>
        ) : (
          <div className="mt-6 flex flex-col items-start gap-4">
            <p className="text-body-l">{t("activitiesEmpty")}</p>
            <ButtonLink href="/itinerari" variant="primary">
              {t("itinerariesTitle")}
            </ButtonLink>
          </div>
        )
      ) : (
        <ul aria-labelledby="titolo-attivita" className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {activities.map((activity) => (
            <li key={activity.id}>
              <CatalogActivityCard activity={activity} locale={locale} interestLabels={labels} />
            </li>
          ))}
        </ul>
      )}

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
    </section>
  );
}
