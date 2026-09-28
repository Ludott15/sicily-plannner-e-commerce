import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CatalogActivityCard } from "@/components/catalog/catalog-activity-card";
import { JsonLd } from "@/components/catalog/json-ld";
import { ButtonLink } from "@/components/design";
import { publicEnv } from "@/lib/env";
import { localizedAlternates } from "@/lib/seo";
import { interestLabels } from "@/server/catalog/labels";
import { listActivities } from "@/server/catalog/queries";

// Lista delle attività: griglia di ActivityCard, come le sezioni a card dei mockup.
// Stato vuoto (schemi.md): una frase che dice cosa fare e un'azione.

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Catalog" });
  return {
    title: t("activitiesTitle"),
    description: t("activitiesDescription"),
    alternates: localizedAlternates(locale, "/attivita"),
    openGraph: { title: t("activitiesTitle"), description: t("activitiesDescription") },
  };
}

export default async function ActivitiesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, activities, labels] = await Promise.all([
    getTranslations("Catalog"),
    listActivities(),
    interestLabels(locale),
  ]);

  return (
    <section className="mx-auto w-full max-w-[1200px] px-4 py-12 md:px-16 md:py-16">
      <h1 className="is-display text-display-l">{t("activitiesTitle")}</h1>
      <p className="mt-3 max-w-2xl text-body-l text-lava-muted">{t("activitiesDescription")}</p>

      {activities.length === 0 ? (
        <div className="mt-12 flex flex-col items-start gap-4">
          <p className="text-body-l">{t("activitiesEmpty")}</p>
          <ButtonLink href="/itinerari" variant="primary">
            {t("itinerariesTitle")}
          </ButtonLink>
        </div>
      ) : (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
