import { useTranslations } from "next-intl";
import { ShopProductCard } from "./shop-product-card";
import type { ShopCard } from "@/server/shop/queries";

// "Dal territorio": prodotti collegati a un luogo, un'attività o un'area (schemi, ProductCard).
// Al massimo tre, in variante orizzontale. La sezione non compare senza prodotti.
export function TerritoryProducts({
  id,
  products,
  locale,
  className = "mt-16",
}: {
  id: string;
  products: ShopCard[];
  locale: string;
  className?: string;
}) {
  const t = useTranslations("Shop");
  if (products.length === 0) return null;
  return (
    <section aria-labelledby={id} className={className}>
      <h2 id={id} className="is-display text-heading-1">
        {t("fromTerritory")}
      </h2>
      <p className="mt-3 max-w-[680px] text-body text-lava-muted">{t("fromTerritoryIntro")}</p>
      <ul className="mt-6 grid gap-6 lg:grid-cols-3">
        {products.slice(0, 3).map((product) => (
          <li key={product.id}>
            <ShopProductCard product={product} locale={locale} row />
          </li>
        ))}
      </ul>
    </section>
  );
}
