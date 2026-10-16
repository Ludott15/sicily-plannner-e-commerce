import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { FREE_SHIPPING_THRESHOLD_CENTS, SHIPPING_FLAT_CENTS } from "@/lib/shop/config";
import { formatCents } from "@/lib/shop/present";
import type { ShopProduct } from "@/server/shop/queries";

// Informazioni del prodotto prima dell'acquisto. Ogni riga compare solo se il dato c'è: un campo
// vuoto non diventa un testo di riempimento. Gli allergeni sono in grassetto in un badge.
export function ProductFacts({ product, locale }: { product: ShopProduct; locale: string }) {
  const t = useTranslations("Shop");
  const rows: { key: string; label: string; value: ReactNode }[] = [];

  if (product.formatLabel) {
    rows.push({ key: "format", label: t("format"), value: product.formatLabel });
  }
  if (product.ingredients) {
    rows.push({ key: "ingredients", label: t("ingredients"), value: product.ingredients });
  }
  // Gli allergeni compaiono solo se verificati: vuoto e verificato vuol dire "nessuno dei 14".
  // Un prodotto non verificato non è visibile, quindi quel caso qui non arriva.
  if (product.allergensDeclared) {
    rows.push({
      key: "allergens",
      label: t("allergens"),
      value:
        product.allergens.length > 0 ? (
          <ul className="mt-1 flex flex-wrap gap-2">
            {product.allergens.map((allergen) => (
              <li
                key={allergen}
                className="rounded-pill border border-coccio-text px-3 py-1 text-body-s font-bold text-lava"
              >
                {t(`allergenNames.${allergen}`)}
              </li>
            ))}
          </ul>
        ) : (
          t("noAllergens")
        ),
    });
  }
  if (product.storage) {
    rows.push({ key: "storage", label: t("storage"), value: product.storage });
  }
  if (product.minShelfLifeDays !== null) {
    rows.push({
      key: "shelfLife",
      label: t("minShelfLife"),
      value: t("minShelfLifeDays", { days: product.minShelfLifeDays }),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {rows.length > 0 && (
        <dl className="flex flex-col divide-y divide-divider">
          {rows.map((row) => (
            <div key={row.key} className="grid gap-1 py-4 md:grid-cols-[160px_1fr] md:gap-6">
              <dt className="text-body-s font-semibold text-lava-muted">{row.label}</dt>
              <dd className="text-body">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {product.isPerishable ? (
        <p role="note" className="rounded-md border border-border-control bg-calce-raised px-4 py-3 text-body">
          <span className="font-semibold">{t("perishableTitle")}</span> {t("perishableNotice")}
        </p>
      ) : (
        <p role="note" className="rounded-md border border-border-control bg-calce-raised px-4 py-3 text-body">
          {/* Il rimando alle condizioni di vendita arriva con il loro testo (passo 8.3). */}
          {t("withdrawalNotice")}
        </p>
      )}

      <p className="text-body-s text-lava-muted">
        {t("shippingNote", {
          cost: formatCents(SHIPPING_FLAT_CENTS, locale),
          threshold: formatCents(FREE_SHIPPING_THRESHOLD_CENTS, locale),
        })}
      </p>
    </div>
  );
}
