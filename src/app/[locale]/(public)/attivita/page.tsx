import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActivityCard } from "@/components/catalog/activity-card";
import { JsonLd } from "@/components/catalog/json-ld";
import { publicEnv } from "@/lib/env";
import { localizedAlternates } from "@/lib/seo";
import { interestLabels } from "@/server/catalog/labels";
import { listActivities } from "@/server/catalog/queries";

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
    <section className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{t("activitiesTitle")}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">{t("activitiesDescription")}</p>

      {activities.length === 0 ? (
        <p className="mt-8 text-muted-foreground">{t("noActivities")}</p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activities.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} locale={locale} interestLabels={labels} />
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
