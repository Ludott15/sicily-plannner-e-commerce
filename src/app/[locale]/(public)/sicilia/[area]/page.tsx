import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CatalogActivityCard } from "@/components/catalog/catalog-activity-card";
import { CoverFigure } from "@/components/catalog/cover-figure";
import { JsonLd } from "@/components/catalog/json-ld";
import { ShopProductCard } from "@/components/shop/shop-product-card";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Link } from "@/lib/i18n/navigation";
import { canonicalFor, truncate } from "@/lib/seo";
import { breadcrumbList } from "@/lib/structured-data";
import { interestLabels } from "@/server/catalog/labels";
import { getAreaPage } from "@/server/catalog/area-queries";

// Pagina di un'area di viaggio (Sicilia › Area): luoghi, attività migliori, itinerari pronti,
// guide collegate e prodotti del territorio. Ogni sezione compare solo se ha dei dati: niente
// testi di riempimento. La descrizione arriva dall'admin; senza, la sezione non c'è.

type Props = { params: Promise<{ locale: string; area: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, area } = await params;
  const page = await getAreaPage(area, locale);
  if (!page) return {};

  const t = await getTranslations({ locale, namespace: "Area" });
  const description = truncate(page.description) ?? t("metaDescription", { area: page.name });
  return {
    title: page.name,
    description,
    alternates: canonicalFor(locale, `/sicilia/${page.slug}`),
    openGraph: { title: page.name, description },
  };
}

export default async function AreaPage({ params }: Props) {
  const { locale, area } = await params;
  setRequestLocale(locale);

  const page = await getAreaPage(area, locale);
  if (!page) notFound();

  const [t, tCatalog, labels] = await Promise.all([
    getTranslations("Area"),
    getTranslations("Catalog"),
    interestLabels(locale),
  ]);

  return (
    <PageContainer width="wide" className="gap-12 md:gap-16">
      <PageHeader
        title={page.name}
        eyebrow={t("eyebrow")}
        subtitle={page.description ?? undefined}
        breadcrumb={[{ label: tCatalog("breadcrumbRoot"), href: "/" }]}
        breadcrumbLabel={tCatalog("breadcrumbLabel")}
      />

      <CoverFigure
        cover={page.cover ? { media: page.cover, source: "area" } : null}
        ratio="16x9"
        sizes="(min-width: 1200px) 1072px, (min-width: 768px) calc(100vw - 128px), 100vw"
        locale={locale}
        placeholder={page.name}
        priority
        frameClassName="aspect-[4/3] md:aspect-[21/9] md:rounded-xl"
        captionClassName="px-4 md:px-0"
      />

      {page.places.length > 0 && (
        <section aria-labelledby="luoghi-area" className="flex flex-col gap-6">
          <h2 id="luoghi-area" className="is-display text-heading-1">
            {t("placesTitle")}
          </h2>
          <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {page.places.map((place) => (
              <li key={place.slug}>
                <Link href={`/luoghi/${place.slug}`} className="text-body-l font-semibold text-lava underline-offset-4 hover:underline">
                  {place.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {page.activities.length > 0 && (
        <section aria-labelledby="attivita-area" className="flex flex-col gap-6">
          <h2 id="attivita-area" className="is-display text-heading-1">
            {t("activitiesTitle")}
          </h2>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {page.activities.map((activity) => (
              <li key={activity.id}>
                <CatalogActivityCard activity={activity} locale={locale} interestLabels={labels} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {page.itineraries.length > 0 && (
        <section aria-labelledby="itinerari-area" className="flex flex-col gap-6">
          <h2 id="itinerari-area" className="is-display text-heading-1">
            {t("itinerariesTitle")}
          </h2>
          <ul className="flex flex-col divide-y divide-divider">
            {page.itineraries.map((itinerary) => (
              <li key={itinerary.slug} className="flex flex-wrap items-baseline justify-between gap-2 py-4">
                <Link href={`/itinerari/${itinerary.slug}`} className="text-body-l font-semibold text-lava underline-offset-4 hover:underline">
                  {itinerary.title}
                </Link>
                <span className="text-body-s text-lava-muted">{tCatalog("days", { count: itinerary.days })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {page.guides.length > 0 && (
        <section aria-labelledby="guide-area" className="flex flex-col gap-6">
          <h2 id="guide-area" className="is-display text-heading-1">
            {t("guidesTitle")}
          </h2>
          <ul className="flex flex-col divide-y divide-divider">
            {page.guides.map((guide) => (
              <li key={guide.slug} className="py-4">
                <Link href={`/guide/${guide.slug}`} className="text-body-l font-semibold text-lava underline-offset-4 hover:underline">
                  {guide.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {page.products.length > 0 && (
        <section aria-labelledby="territorio-area" className="flex flex-col gap-6">
          <h2 id="territorio-area" className="is-display text-heading-1">
            {t("productsTitle")}
          </h2>
          <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {page.products.map((product) => (
              <li key={product.id}>
                <ShopProductCard product={product} locale={locale} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <JsonLd
        data={breadcrumbList(
          [
            { name: tCatalog("breadcrumbRoot"), path: "/" },
            { name: page.name, path: `/sicilia/${page.slug}` },
          ],
          locale,
        )}
      />
    </PageContainer>
  );
}
