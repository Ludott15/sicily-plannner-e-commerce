"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";
import { buttonClass } from "@/components/design";
import type { AdminFormAction } from "@/lib/admin-form";
import { ALLERGENS } from "@/lib/shop/allergens";
import { PRODUCT_CATEGORIES, STOCK_STATUSES, VAT_RATES } from "@/lib/shop/config";
import { eurInputFromCents } from "@/lib/shop/present";
import type { ProductFormValues, ShopFormOptions } from "@/lib/shop/form-values";
import { Checkbox, Field, FormError, FormNotice, Select, TextArea, TextInput } from "./fields";
import { useAdminForm } from "./use-admin-form";

// Prodotto dello shop: tutti i campi del passo 7.1. Prezzo e costo si digitano in euro, IVA inclusa
// per il prezzo; il costo non esce mai nelle pagine pubbliche. Gli allergeni vengono dall'elenco
// chiuso dei 14 della UE. Le box hanno la quantità di ciascun componente (0 = non incluso).
// La copertina non si sceglie qui: si assegna dalle Immagini (docs/IMMAGINI.md); la galleria sì.

function CheckGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-body-s font-semibold">{legend}</legend>
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

export function ProductForm({
  action,
  values,
  options,
}: {
  action: AdminFormAction;
  values: ProductFormValues;
  options: ShopFormOptions;
}) {
  const t = useTranslations("Admin.shop");
  const tShop = useTranslations("Shop");
  const tAdmin = useTranslations("Admin");
  const save = useAdminForm(action);
  const id = (field: string) => `product-${values.id ?? "new"}-${field}`;
  const boxCandidates = options.products.filter((product) => product.id !== values.id);
  // Il server rifiuta un prodotto attivo senza "Allergeni verificati" con il codice generico
  // "invalid": qui si traduce in un messaggio chiaro, controllando i valori appena inviati.
  const [activeWithoutAllergens, setActiveWithoutAllergens] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    setActiveWithoutAllergens(data.get("isActive") === "on" && data.get("allergensDeclared") !== "on");
    save.onSubmit(event);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8 rounded-lg border border-card-edge bg-calce-raised p-6">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <FormError message={save.state.status === "error" ? tAdmin(`errors.${save.state.code}`) : null} />
      <FormError
        message={save.state.status === "error" && save.state.code === "invalid" && activeWithoutAllergens ? t("activeNeedsAllergens") : null}
      />
      <FormNotice message={save.state.status === "saved" ? t("saved") : null} />

      <section className="flex flex-col gap-4">
        <h2 className="is-display text-heading-2">{t("productSectionBase")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("productTitleIt")} htmlFor={id("title-it")}>
            <TextInput id={id("title-it")} name="titleIt" defaultValue={values.titleIt} minLength={2} maxLength={160} required />
          </Field>
          <Field label={t("productTitleEn")} htmlFor={id("title-en")}>
            <TextInput id={id("title-en")} name="titleEn" defaultValue={values.titleEn ?? ""} maxLength={160} />
          </Field>
          <Field label={t("productSlug")} htmlFor={id("slug")} hint={t("slugHint")}>
            <TextInput
              id={id("slug")}
              name="slug"
              defaultValue={values.slug}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={80}
              required
            />
          </Field>
          <Field label={t("productCategory")} htmlFor={id("category")}>
            <Select id={id("category")} name="category" defaultValue={values.category}>
              {PRODUCT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {tShop(`category.${category}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("productProducer")} htmlFor={id("producer")}>
            <Select id={id("producer")} name="producerId" defaultValue={values.producerId} required>
              <option value="">{t("chooseOption")}</option>
              {options.producers.map((producer) => (
                <option key={producer.id} value={producer.id}>
                  {producer.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("productSupplier")} htmlFor={id("supplier")} hint={t("productSupplierHint")}>
            <Select id={id("supplier")} name="supplierId" defaultValue={values.supplierId} required>
              <option value="">{t("chooseOption")}</option>
              {options.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("productSupplierSku")} htmlFor={id("sku")}>
            <TextInput id={id("sku")} name="supplierSku" defaultValue={values.supplierSku ?? ""} maxLength={80} />
          </Field>
          <Field label={t("productFormat")} htmlFor={id("format")} hint={t("productFormatHint")}>
            <TextInput id={id("format")} name="formatLabel" defaultValue={values.formatLabel ?? ""} maxLength={60} />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="is-display text-heading-2">{t("productSectionPrice")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("productPrice")} htmlFor={id("price")} hint={t("productPriceHint")}>
            <TextInput id={id("price")} name="priceEur" inputMode="decimal" defaultValue={eurInputFromCents(values.priceCents)} required />
          </Field>
          <Field label={t("productVat")} htmlFor={id("vat")} hint={t("productVatHint")}>
            <Select id={id("vat")} name="vatRate" defaultValue={String(values.vatRate)}>
              {VAT_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {t("vatOption", { rate })}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("productCost")} htmlFor={id("cost")} hint={t("productCostHint")}>
            <TextInput id={id("cost")} name="costEur" inputMode="decimal" defaultValue={eurInputFromCents(values.costCents)} />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="is-display text-heading-2">{t("productSectionInfo")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("productDescriptionIt")} htmlFor={id("desc-it")}>
            <TextArea id={id("desc-it")} name="descriptionIt" defaultValue={values.descriptionIt ?? ""} maxLength={4000} />
          </Field>
          <Field label={t("productDescriptionEn")} htmlFor={id("desc-en")}>
            <TextArea id={id("desc-en")} name="descriptionEn" defaultValue={values.descriptionEn ?? ""} maxLength={4000} />
          </Field>
          <Field label={t("productIngredientsIt")} htmlFor={id("ing-it")} hint={t("productIngredientsHint")}>
            <TextArea id={id("ing-it")} name="ingredientsIt" defaultValue={values.ingredientsIt ?? ""} maxLength={2000} />
          </Field>
          <Field label={t("productIngredientsEn")} htmlFor={id("ing-en")}>
            <TextArea id={id("ing-en")} name="ingredientsEn" defaultValue={values.ingredientsEn ?? ""} maxLength={2000} />
          </Field>
          <Field label={t("productStorageIt")} htmlFor={id("store-it")}>
            <TextArea id={id("store-it")} name="storageIt" defaultValue={values.storageIt ?? ""} maxLength={500} />
          </Field>
          <Field label={t("productStorageEn")} htmlFor={id("store-en")}>
            <TextArea id={id("store-en")} name="storageEn" defaultValue={values.storageEn ?? ""} maxLength={500} />
          </Field>
        </div>
        <CheckGroup legend={t("productAllergens")}>
          {ALLERGENS.map((allergen) => (
            <Checkbox
              key={allergen}
              name="allergens"
              value={allergen}
              label={tShop(`allergenNames.${allergen}`)}
              defaultChecked={values.allergens.includes(allergen)}
            />
          ))}
        </CheckGroup>
        <Checkbox label={t("productAllergensDeclared")} name="allergensDeclared" defaultChecked={values.allergensDeclared} />
        <p className="text-body-s text-lava-muted">{t("productAllergensDeclaredHint")}</p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="is-display text-heading-2">{t("productSectionStock")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("productStock")} htmlFor={id("stock")}>
            <Select id={id("stock")} name="stockStatus" defaultValue={values.stockStatus}>
              {STOCK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {tShop(`stock.${status}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("productLeadTime")} htmlFor={id("lead")} hint={t("productLeadTimeHint")}>
            <TextInput id={id("lead")} name="leadTimeDays" type="number" min={0} max={60} defaultValue={values.leadTimeDays} required />
          </Field>
          <Field label={t("productShelfLife")} htmlFor={id("shelf")} hint={t("productShelfLifeHint")}>
            <TextInput
              id={id("shelf")}
              name="minShelfLifeDays"
              type="number"
              min={0}
              max={3650}
              defaultValue={values.minShelfLifeDays ?? ""}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <Checkbox label={t("productPerishable")} name="isPerishable" defaultChecked={values.isPerishable} />
          <Checkbox label={t("active")} name="isActive" defaultChecked={values.isActive} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="is-display text-heading-2">{t("productSectionLinks")}</h2>
        <Field label={t("productArea")} htmlFor={id("area")}>
          <Select id={id("area")} name="areaId" defaultValue={values.areaId ?? ""}>
            <option value="">{t("noneOption")}</option>
            {options.areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </Select>
        </Field>
        <CheckGroup legend={t("productPlaces")}>
          {options.places.map((place) => (
            <Checkbox
              key={place.id}
              name="placeIds"
              value={place.id}
              label={place.name}
              defaultChecked={values.placeIds.includes(place.id)}
            />
          ))}
        </CheckGroup>
        <CheckGroup legend={t("productActivities")}>
          {options.activities.map((activity) => (
            <Checkbox
              key={activity.id}
              name="activityIds"
              value={activity.id}
              label={activity.title}
              defaultChecked={values.activityIds.includes(activity.id)}
            />
          ))}
        </CheckGroup>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="is-display text-heading-2">{t("productSectionMedia")}</h2>
        <p className="text-body-s text-lava-muted">{t("productMediaHint")}</p>
        <CheckGroup legend={t("productGallery")}>
          {options.media.map((media) => (
            <Checkbox
              key={media.id}
              name="mediaIds"
              value={media.id}
              label={media.label}
              defaultChecked={values.mediaIds.includes(media.id)}
            />
          ))}
        </CheckGroup>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="is-display text-heading-2">{t("productSectionBox")}</h2>
        <p className="text-body-s text-lava-muted">{t("productBoxHint")}</p>
        {boxCandidates.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {boxCandidates.map((product) => {
              const current = values.boxItems.find((item) => item.productId === product.id);
              return (
                <Field key={product.id} label={product.title} htmlFor={id(`box-${product.id}`)}>
                  <TextInput
                    id={id(`box-${product.id}`)}
                    name={`boxQuantity:${product.id}`}
                    type="number"
                    min={0}
                    max={99}
                    defaultValue={current?.quantity ?? 0}
                  />
                </Field>
              );
            })}
          </div>
        )}
      </section>

      <div>
        <button type="submit" className={buttonClass("primary")} disabled={save.pending}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}
