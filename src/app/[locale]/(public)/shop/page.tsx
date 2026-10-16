import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { JsonLd } from "@/components/catalog/json-ld";
import { ButtonLink } from "@/components/design";
import { ShopFilters, PRICE_CAPS_EUR, type ShopFilterValues } from "@/components/shop/shop-filters";
import { ShopProductCard } from "@/components/shop/shop-product-card";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { publicEnv } from "@/lib/env";
import { localizedPath, canonicalFor } from "@/lib/seo";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@/lib/shop/config";
import { listProducerOptions, listProducts, listShopAreaOptions, type ShopFilters as ShopQueryFilters } from "@/server/shop/queries";

// Shop (passo 7.1, mockup ProductCard): griglia di ProductCard con filtri nell'URL
// (?categoria=olio&produttore=slug&area=slug&prezzo=20). I valori dell'URL si accettano solo se
// esistono nelle opzioni: il resto cade su "tutti". Canonical senza filtri.
// Stato vuoto (schemi.md): una frase che dice cosa fare, con un'azione.

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ categoria?: string; produttore?: string; area?: string; prezzo?: string }>;
};

export async function generateMetadata({ params }: Omit<Props, "searchParams">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Shop" });
  return {
    title: t("shopTitle"),
    description: t("shopDescription"),
    alternates: canonicalFor(locale, "/shop"),
    openGraph: { title: t("shopTitle"), description: t("shopDescription") },
  };
}

function isCategory(value: string | undefined): value is ProductCategory {
  return (PRODUCT_CATEGORIES as readonly string[]).includes(value ?? "");
}

export default async function ShopPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const search = await searchParams;
  const [t, producers, areas] = await Promise.all([
    getTranslations("Shop"),
    listProducerOptions(locale),
    listShopAreaOptions(locale),
  ]);

  const selected: ShopFilterValues = {
    category: isCategory(search.categoria) ? search.categoria : undefined,
    producer: producers.some((p) => p.slug === search.produttore) ? search.produttore : undefined,
    area: areas.some((a) => a.slug === search.area) ? search.area : undefined,
    maxPriceEur: (PRICE_CAPS_EUR as readonly number[]).includes(Number(search.prezzo)) ? Number(search.prezzo) : undefined,
  };
  const filtered = Boolean(selected.category || selected.producer || selected.area || selected.maxPriceEur);

  const queryFilters: ShopQueryFilters = {
    category: selected.category,
    producer: selected.producer,
    area: selected.area,
    maxPriceCents: selected.maxPriceEur !== undefined ? selected.maxPriceEur * 100 : undefined,
  };
  const products = await listProducts(queryFilters, locale);

  return (
    <PageContainer width="wide">
      <PageHeader title={t("shopTitle")} subtitle={t("shopIntro")} />

      <ShopFilters action={localizedPath(locale, "/shop")} producers={producers} areas={areas} selected={selected} />

      {products.length === 0 ? (
        filtered ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-body-l">{t("shopFilteredEmpty")}</p>
            <ButtonLink href="/shop" variant="primary">
              {t("filterClear")}
            </ButtonLink>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-4">
            <p className="text-body-l">{t("shopEmpty")}</p>
            <ButtonLink href="/attivita" variant="primary">
              {t("shopEmptyAction")}
            </ButtonLink>
          </div>
        )
      ) : (
        <>
          <p role="status" className="text-body-s text-lava-muted">
            {t("shopCount", { count: products.length })}
          </p>
          <ul aria-label={t("shopTitle")} className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <li key={product.id}>
                <ShopProductCard product={product} locale={locale} />
              </li>
            ))}
          </ul>
        </>
      )}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: t("shopTitle"),
          itemListElement: products.map((product, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${publicEnv.NEXT_PUBLIC_SITE_URL}/${locale}/prodotti/${product.slug}`,
            name: product.title,
          })),
        }}
      />
    </PageContainer>
  );
}
