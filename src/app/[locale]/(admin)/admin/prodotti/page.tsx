import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { formatCents } from "@/lib/shop/present";
import { listProductsAdmin } from "@/server/shop/products.admin";

// Prodotti dello shop (passo 7.1): elenco con stato, prezzo IVA inclusa e produttore. Il costo e il
// fornitore si vedono solo nella scheda di modifica. Solo admin.
export default async function ProductsAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, rows] = await Promise.all([getTranslations("Admin.shop"), listProductsAdmin()]);

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="is-display text-heading-1">{t("productsTitle")}</h1>
          <p className="max-w-2xl text-body text-lava-muted">{t("productsIntro")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/admin/prodotti/import" variant="secondary">
            {t("importProducts")}
          </ButtonLink>
          <ButtonLink href="/admin/prodotti/nuovo" variant="primary">
            {t("newProduct")}
          </ButtonLink>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-body-l">{t("productsEmpty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-body">
            <thead>
              <tr className="border-b border-divider text-body-s text-lava-muted">
                <th scope="col" className="py-3 pr-4 font-semibold">
                  {t("productTitleIt")}
                </th>
                <th scope="col" className="py-3 pr-4 font-semibold">
                  {t("productProducer")}
                </th>
                <th scope="col" className="py-3 pr-4 font-semibold">
                  {t("productPrice")}
                </th>
                <th scope="col" className="py-3 pr-4 font-semibold">
                  {t("productStock")}
                </th>
                <th scope="col" className="py-3 font-semibold">
                  {t("productActive")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-divider">
                  <td className="py-3 pr-4">
                    <Link href={`/admin/prodotti/${row.id}`} className="font-semibold text-lava underline-offset-4 hover:underline">
                      {row.titleIt}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-lava-muted">{row.producerName}</td>
                  <td className="py-3 pr-4">{formatCents(row.priceCents, locale)}</td>
                  <td className="py-3 pr-4">{t(`stockLabel.${row.stockStatus}`)}</td>
                  <td className="py-3">{row.isActive ? t("yes") : t("no")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
