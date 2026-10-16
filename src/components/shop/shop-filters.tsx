import { useTranslations } from "next-intl";
import { Button, ButtonLink } from "@/components/design";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@/lib/shop/config";
import { cn } from "@/lib/utils";

// Filtri dello shop nell'URL (?categoria=olio&produttore=slug&area=slug&prezzo=20): un modulo GET
// che funziona anche senza JavaScript. Il server legge i valori e li convalida contro le opzioni.
// Il prezzo massimo è in euro (prezzo IVA inclusa).

const control =
  "min-h-11 w-full rounded-sm border-[1.5px] border-border-control bg-calce-raised px-3 text-body text-lava";

export const PRICE_CAPS_EUR = [10, 20, 30] as const;

export type ShopFilterValues = {
  category?: ProductCategory;
  producer?: string;
  area?: string;
  maxPriceEur?: number;
};

export function ShopFilters({
  action,
  producers,
  areas,
  selected,
}: {
  // Percorso localizzato della pagina (es. /it/shop): il modulo GET lo usa come destinazione.
  action: string;
  producers: { slug: string; name: string }[];
  areas: { slug: string; name: string }[];
  selected: ShopFilterValues;
}) {
  const t = useTranslations("Shop");
  const active = Boolean(selected.category || selected.producer || selected.area || selected.maxPriceEur);

  return (
    <form method="get" action={action} className="grid gap-4 rounded-lg border border-card-edge bg-calce-raised p-4 md:grid-cols-4 md:p-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="shop-filtro-categoria" className="text-body-s font-semibold">{t("filterCategory")}</label>
        <select id="shop-filtro-categoria" name="categoria" defaultValue={selected.category ?? ""} className={cn(control)}>
          <option value="">{t("filterAllCategories")}</option>
          {PRODUCT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {t(`category.${category}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="shop-filtro-produttore" className="text-body-s font-semibold">{t("filterProducer")}</label>
        <select id="shop-filtro-produttore" name="produttore" defaultValue={selected.producer ?? ""} className={cn(control)}>
          <option value="">{t("filterAllProducers")}</option>
          {producers.map((producer) => (
            <option key={producer.slug} value={producer.slug}>
              {producer.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="shop-filtro-area" className="text-body-s font-semibold">{t("filterArea")}</label>
        <select id="shop-filtro-area" name="area" defaultValue={selected.area ?? ""} className={cn(control)}>
          <option value="">{t("filterAllAreas")}</option>
          {areas.map((area) => (
            <option key={area.slug} value={area.slug}>
              {area.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="shop-filtro-prezzo" className="text-body-s font-semibold">{t("filterPrice")}</label>
        <select id="shop-filtro-prezzo" name="prezzo" defaultValue={selected.maxPriceEur ? String(selected.maxPriceEur) : ""} className={cn(control)}>
          <option value="">{t("filterAnyPrice")}</option>
          {PRICE_CAPS_EUR.map((cap) => (
            <option key={cap} value={cap}>
              {t("filterUpTo", { price: cap })}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3 md:col-span-4">
        <Button type="submit" variant="secondary">
          {t("filterApply")}
        </Button>
        {active && (
          <ButtonLink href="/shop" variant="ghost">
            {t("filterClear")}
          </ButtonLink>
        )}
      </div>
    </form>
  );
}
