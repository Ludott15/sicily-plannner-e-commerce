import { useTranslations } from "next-intl";
import { PendingButton, ProductCard } from "@/components/design";
import { formatCents, productImageUrl } from "@/lib/shop/present";
import type { ShopCard } from "@/server/shop/queries";

// Card di un prodotto nello shop, nelle pagine di produttore, luogo, attività e area.
// Il produttore è sempre visibile (ProductCard): "Produttore · Luogo". Il prezzo è IVA inclusa.
// "Aggiungi al carrello" resta disabilitato finché il carrello non esiste (passo 7.2).
export function ShopProductCard({ product, locale, row = false }: { product: ShopCard; locale: string; row?: boolean }) {
  const t = useTranslations("Shop");
  const maker = product.origin ? `${product.producer.name} · ${product.origin}` : product.producer.name;
  return (
    <ProductCard
      href={`/prodotti/${product.slug}`}
      title={product.title}
      maker={maker}
      price={t("priceWithVat", { price: formatCents(product.priceCents, locale) })}
      imageUrl={productImageUrl(product.cover)}
      placeholder={product.title}
      row={row}
      action={
        <PendingButton id="cart.add" variant="secondary" size="sm">
          {t("addToCart")}
        </PendingButton>
      }
    />
  );
}
