import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ItineraryCard } from "@/components/catalog/itinerary-card";
import { ButtonLink } from "@/components/design";
import { localizedAlternates } from "@/lib/seo";
import { listTemplates } from "@/server/catalog/queries";

// Lista degli itinerari pronti: stesse card della sezione "Itinerari pronti" della home.

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Catalog" });
  return {
    title: t("itinerariesTitle"),
    description: t("itinerariesDescription"),
    alternates: localizedAlternates(locale, "/itinerari"),
    openGraph: { title: t("itinerariesTitle"), description: t("itinerariesDescription") },
  };
}

export default async function ItinerariesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, templates] = await Promise.all([getTranslations("Catalog"), listTemplates()]);

  return (
    <section className="mx-auto w-full max-w-[1200px] px-4 py-12 md:px-16 md:py-16">
      <h1 className="is-display text-display-l">{t("itinerariesTitle")}</h1>
      <p className="mt-3 max-w-2xl text-body-l text-lava-muted">{t("itinerariesDescription")}</p>

      {templates.length === 0 ? (
        <div className="mt-12 flex flex-col items-start gap-4">
          <p className="text-body-l">{t("itinerariesEmpty")}</p>
          <ButtonLink href="/attivita" variant="primary">
            {t("exploreActivities")}
          </ButtonLink>
        </div>
      ) : (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((it) => (
            <li key={it.id}>
              <ItineraryCard itinerary={it} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
