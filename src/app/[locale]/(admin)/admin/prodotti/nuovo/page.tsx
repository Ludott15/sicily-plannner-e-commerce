import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProductForm } from "@/components/admin/product-form";
import type { ProductFormValues } from "@/lib/shop/form-values";
import { saveProduct } from "@/server/shop/products.admin";
import { listShopFormOptions } from "@/server/shop/options.admin";

// Nuovo prodotto (passo 7.1). Un prodotto esce nello shop solo con produttore pubblico e attivo.
export default async function NewProductPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, options] = await Promise.all([getTranslations("Admin.shop"), listShopFormOptions()]);

  const empty: ProductFormValues = {
    id: null,
    slug: "",
    supplierId: "",
    producerId: "",
    supplierSku: null,
    titleIt: "",
    titleEn: null,
    category: "altro",
    formatLabel: null,
    priceCents: 0,
    costCents: null,
    vatRate: 10,
    descriptionIt: null,
    descriptionEn: null,
    ingredientsIt: null,
    ingredientsEn: null,
    allergens: [],
    allergensDeclared: false,
    storageIt: null,
    storageEn: null,
    minShelfLifeDays: null,
    isPerishable: false,
    stockStatus: "available",
    leadTimeDays: 3,
    areaId: null,
    placeIds: [],
    activityIds: [],
    mediaIds: [],
    boxItems: [],
    isActive: false,
  };

  return (
    <section className="flex flex-col gap-6">
      <h1 className="is-display text-heading-1">{t("newProduct")}</h1>
      <ProductForm action={saveProduct} values={empty} options={options} />
    </section>
  );
}
