import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Breadcrumb } from "@/components/catalog/breadcrumb";
import { CoverFigure } from "@/components/catalog/cover-figure";
import { JsonLd } from "@/components/catalog/json-ld";
import { PendingButton } from "@/components/design";
import { ProductFacts } from "@/components/shop/product-facts";
import { Link } from "@/lib/i18n/navigation";
import { canonicalFor, truncate } from "@/lib/seo";
import { eurDecimalFromCents, formatCents, productImageUrl } from "@/lib/shop/present";
import { breadcrumbList, product as productJsonLd } from "@/lib/structured-data";
import { getProduct } from "@/server/shop/queries";

// Pagina di prodotto (mockup ProductCard e schemi "Prezzi"): galleria, prezzo IVA inclusa, produttore,
// informazioni obbligatorie prima dell'acquisto (ingredienti, allergeni in evidenza, conservazione,
// scadenza minima, deperibile con l'avviso sul recesso, tempi di spedizione), "Dal territorio" con i
// collegamenti a luoghi e attività, e la box con i suoi componenti. Ogni riga compare solo se il dato c'è.

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await getProduct(slug, locale);
  if (!product) return {};

  const description = truncate(product.descriptionText) ?? `${product.title} · ${product.producer.name}`;
  return {
    title: `${product.title} · ${product.producer.name}`,
    description,
    alternates: canonicalFor(locale, `/prodotti/${product.slug}`),
    openGraph: { title: product.title, description, type: "website" },
  };
}

export default async function ProductPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const product = await getProduct(slug, locale);
  if (!product) notFound();

  const [t, tCatalog] = await Promise.all([getTranslations("Shop"), getTranslations("Catalog")]);
  const price = formatCents(product.priceCents, locale);

  return (
    <article className="mx-auto w-full max-w-[1200px] px-4 pt-4 pb-12 md:px-16 md:pt-8 md:pb-16">
      <Breadcrumb
        items={[
          { label: tCatalog("breadcrumbRoot"), href: "/" },
          { label: t("shopTitle"), href: "/shop" },
          { label: product.title },
        ]}
      />

      <div className="mt-6 grid gap-10 md:grid-cols-12 md:gap-12">
        <div className="flex flex-col gap-4 md:col-span-6">
          <CoverFigure
            cover={product.gallery[0] ? { media: product.gallery[0], source: "own" } : null}
            ratio="1x1"
            sizes="(min-width: 1200px) 540px, (min-width: 768px) 50vw, 100vw"
            locale={locale}
            placeholder={product.title}
            priority
            frameClassName="aspect-square rounded-xl"
            captionClassName="px-0"
          />
          {product.gallery.length > 1 && (
            <ul className="grid grid-cols-3 gap-3">
              {product.gallery.slice(1).map((media) => (
                <li key={media.id}>
                  <CoverFigure
                    cover={{ media, source: "own" }}
                    ratio="1x1"
                    sizes="160px"
                    locale={locale}
                    placeholder={product.title}
                    frameClassName="aspect-square rounded-lg"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-8 md:col-span-6">
          <header className="flex flex-col gap-3">
            <Link
              href={`/produttori/${product.producer.slug}`}
              className="text-caption font-semibold tracking-[0.08em] text-coccio-text uppercase no-underline hover:underline"
            >
              {product.producer.name}
            </Link>
            <h1 className="is-display text-heading-1 text-balance md:text-display-l">{product.title}</h1>
            {product.descriptionText && <p className="text-body-l text-pretty">{product.descriptionText}</p>}
          </header>

          <div className="flex flex-col gap-3 border-y border-divider py-6">
            <p className="is-display text-display-l">{price}</p>
            <p className="text-body-s text-lava-muted">{t("vatIncluded")}</p>
            <p className="text-body font-semibold">{t(`stock.${product.stockStatus}`)}</p>
            <p className="text-body">{t("leadTime", { days: product.leadTimeDays })}</p>
            <div className="pt-2">
              <PendingButton id="cart.add" variant="primary" fullWidth>
                {t("addToCart")}
              </PendingButton>
            </div>
          </div>

          <ProductFacts product={product} locale={locale} />
        </div>
      </div>

      {product.boxItems.length > 0 && (
        <section aria-labelledby="dentro-la-box" className="mt-16">
          <h2 id="dentro-la-box" className="is-display text-heading-1">
            {t("boxContains")}
          </h2>
          <ul className="mt-6 flex flex-col divide-y divide-divider">
            {product.boxItems.map((item) => (
              <li key={item.slug} className="py-4 text-body-l">
                <span className="text-lava-muted">{t("boxQuantity", { quantity: item.quantity })}</span>{" "}
                <Link href={`/prodotti/${item.slug}`} className="font-semibold text-lava underline-offset-4 hover:underline">
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="dal-produttore" className="mt-16">
        <h2 id="dal-produttore" className="is-display text-heading-1">
          {t("fromProducer")}
        </h2>
        <p className="mt-4 text-body-l">
          <Link href={`/produttori/${product.producer.slug}`} className="font-semibold text-lava underline-offset-4 hover:underline">
            {t("producerLink", { name: product.producer.name })}
          </Link>
        </p>
      </section>

      {product.links.length > 0 && (
        <section aria-labelledby="dal-territorio-prodotto" className="mt-16">
          <h2 id="dal-territorio-prodotto" className="is-display text-heading-1">
            {t("fromTerritory")}
          </h2>
          <ul className="mt-6 flex flex-col divide-y divide-divider">
            {product.links.map((link) => (
              <li key={`${link.kind}-${link.slug}`} className="py-4">
                <Link
                  href={link.kind === "place" ? `/luoghi/${link.slug}` : `/attivita/${link.slug}`}
                  className="text-body-l font-semibold text-lava underline-offset-4 hover:underline"
                >
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <JsonLd
        data={breadcrumbList(
          [
            { name: tCatalog("breadcrumbRoot"), path: "/" },
            { name: t("shopTitle"), path: "/shop" },
            { name: product.title, path: `/prodotti/${product.slug}` },
          ],
          locale,
        )}
      />
      <JsonLd
        data={productJsonLd({
          name: product.title,
          description: product.descriptionText,
          path: `/prodotti/${product.slug}`,
          locale,
          imageUrl: productImageUrl(product.gallery[0] ?? null),
          priceEur: eurDecimalFromCents(product.priceCents),
          inStock: product.stockStatus === "available",
        })}
      />
    </article>
  );
}
