import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProductForm } from "@/components/admin/product-form";
import { ButtonLink } from "@/components/design";
import { getProductAdmin, saveProduct } from "@/server/shop/products.admin";
import { listShopFormOptions } from "@/server/shop/options.admin";

// Modifica di un prodotto (passo 7.1). Ogni salvataggio scrive admin_audit_log dal codice server.
export default async function EditProductPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [t, product, options] = await Promise.all([
    getTranslations("Admin.shop"),
    getProductAdmin(id),
    listShopFormOptions(),
  ]);
  if (!product) notFound();

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="is-display text-heading-1">{product.titleIt}</h1>
        {product.isActive && (
          <ButtonLink href={`/prodotti/${product.slug}`} variant="secondary" size="sm">
            {t("openPublicPage")}
          </ButtonLink>
        )}
      </div>
      <ProductForm action={saveProduct} values={product} options={options} />
    </section>
  );
}
