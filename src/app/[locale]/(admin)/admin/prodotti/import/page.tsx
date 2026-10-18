import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProductImport } from "@/components/admin/product-import";
import { importProducts } from "@/server/shop/products-import.admin";
import { listShopFormOptions } from "@/server/shop/options.admin";

// Importazione CSV dei prodotti dal catalogo del fornitore: anteprima con errori per riga, poi conferma.
// Il file non si salva: si legge, si valida e si applica. Solo admin.
export default async function ProductImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, options] = await Promise.all([getTranslations("Admin.shop"), listShopFormOptions()]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-heading-1">{t("importProductsTitle")}</h1>
        <p className="max-w-2xl text-body text-lava-muted">{t("importProductsIntro")}</p>
      </div>
      <ProductImport action={importProducts} suppliers={options.suppliers} />
    </section>
  );
}
