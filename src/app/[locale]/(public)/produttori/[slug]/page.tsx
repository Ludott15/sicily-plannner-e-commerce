import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CoverFigure } from "@/components/catalog/cover-figure";
import { JsonLd } from "@/components/catalog/json-ld";
import { ButtonLink } from "@/components/design";
import { ShopProductCard } from "@/components/shop/shop-product-card";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Link } from "@/lib/i18n/navigation";
import { canonicalFor, truncate } from "@/lib/seo";
import { breadcrumbList } from "@/lib/structured-data";
import { getProducer, listProducts } from "@/server/shop/queries";

// Pagina del produttore di origine (passo 7.1): chi lo fa, dove, la storia e i suoi prodotti.
// Il produttore è un'informazione editoriale: il fornitore che spedisce non compare mai qui.
// Sezioni senza dati non compaiono: niente storia, niente testo di riempimento.

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const producer = await getProducer(slug, locale);
  if (!producer) return {};

  const description = truncate(producer.story) ?? producer.name;
  return {
    title: producer.name,
    description,
    alternates: canonicalFor(locale, `/produttori/${producer.slug}`),
    openGraph: { title: producer.name, description },
  };
}

export default async function ProducerPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const producer = await getProducer(slug, locale);
  if (!producer) notFound();

  const [t, tCatalog, products] = await Promise.all([
    getTranslations("Shop"),
    getTranslations("Catalog"),
    listProducts({ producer: producer.slug }, locale),
  ]);

  return (
    <PageContainer width="wide" className="gap-12 md:gap-16">
      <PageHeader
        title={producer.name}
        eyebrow={t("producerEyebrow")}
        breadcrumb={[
          { label: tCatalog("breadcrumbRoot"), href: "/" },
          { label: t("shopTitle"), href: "/shop" },
        ]}
        breadcrumbLabel={tCatalog("breadcrumbLabel")}
        meta={
          producer.place || producer.area ? (
            <span className="flex flex-wrap gap-x-2">
              {producer.place && (
                <Link href={`/luoghi/${producer.place.slug}`} className="text-lava underline-offset-4 hover:underline">
                  {producer.place.name}
                </Link>
              )}
              {producer.place && producer.area && <span aria-hidden="true">·</span>}
              {producer.area && (
                <Link href={`/sicilia/${producer.area.slug}`} className="text-lava underline-offset-4 hover:underline">
                  {producer.area.name}
                </Link>
              )}
            </span>
          ) : undefined
        }
      />

      {producer.cover && (
        <CoverFigure
          cover={{ media: producer.cover, source: "own" }}
          ratio="16x9"
          sizes="(min-width: 1200px) 1072px, (min-width: 768px) calc(100vw - 128px), 100vw"
          locale={locale}
          placeholder={producer.name}
          priority
          frameClassName="aspect-[4/3] md:aspect-[21/9] md:rounded-xl"
          captionClassName="px-4 md:px-0"
        />
      )}

      {producer.story && (
        <section aria-labelledby="storia-produttore" className="flex max-w-[680px] flex-col gap-4">
          <h2 id="storia-produttore" className="is-display text-heading-1">
            {t("producerStory")}
          </h2>
          <p className="text-body-l whitespace-pre-line text-pretty">{producer.story}</p>
        </section>
      )}

      <section aria-labelledby="prodotti-produttore" className="flex flex-col gap-6">
        <h2 id="prodotti-produttore" className="is-display text-heading-1">
          {t("producerProducts")}
        </h2>
        {products.length === 0 ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-body-l">{t("producerEmpty")}</p>
            <ButtonLink href="/shop" variant="primary">
              {t("backToShop")}
            </ButtonLink>
          </div>
        ) : (
          <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <li key={product.id}>
                <ShopProductCard product={product} locale={locale} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <JsonLd
        data={breadcrumbList(
          [
            { name: tCatalog("breadcrumbRoot"), path: "/" },
            { name: t("shopTitle"), path: "/shop" },
            { name: producer.name, path: `/produttori/${producer.slug}` },
          ],
          locale,
        )}
      />
    </PageContainer>
  );
}
