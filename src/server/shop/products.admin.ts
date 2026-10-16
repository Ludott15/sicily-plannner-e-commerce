"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AdminFormAction, AdminFormState } from "@/lib/admin-form";
import { parseAllergens } from "@/lib/shop/allergens";
import { PRODUCT_CATEGORIES, STOCK_STATUSES, VAT_RATES } from "@/lib/shop/config";
import type { ProductFormValues } from "@/lib/shop/form-values";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { boxItems, productLinks, productMedia, producers, products } from "@/server/db/schema";
import { dbErrorCode, emptyToNull } from "./action-utils";
import { formBoxItems, formEurCents, formFlag, formInteger, formList, formOptionalText, formText } from "./form";

// Prodotti (solo admin): scheda, galleria (la prima foto è la copertina), collegamenti "Dal
// territorio" (luoghi e attività) e composizione della box. Ordine: lettura dei campi → Zod →
// requireAdmin → una transazione dbAdmin che riscrive galleria, collegamenti e box.
// Un prodotto è visibile solo se attivo, con produttore pubblico e fornitore attivo. Attivarlo
// richiede gli allergeni dichiarati (regola nel server e check products_active_requires_allergens_declared).

const PRODUCTS_PATH = "/[locale]/admin/prodotti";

const idOrNull = (value: string): string | null => (value === "" ? null : value);

const uuidList = (values: string[]) => [...new Set(values)];

const productInput = z
  .object({
    id: z.uuid().nullable(),
    slug: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    supplierId: z.uuid(),
    producerId: z.uuid(),
    supplierSku: z.string().max(80).nullable(),
    titleIt: z.string().min(1).max(200),
    titleEn: z.string().max(200).nullable(),
    category: z.enum(PRODUCT_CATEGORIES),
    formatLabel: z.string().max(80).nullable(),
    priceCents: z.number().int().min(0).max(10_000_000),
    costCents: z.number().int().min(0).max(10_000_000).nullable(),
    vatRate: z.union(VAT_RATES.map((rate) => z.literal(rate))),
    descriptionIt: z.string().max(2000).nullable(),
    descriptionEn: z.string().max(2000).nullable(),
    ingredientsIt: z.string().max(2000).nullable(),
    ingredientsEn: z.string().max(2000).nullable(),
    allergens: z.array(z.string().max(40)).max(14),
    allergensDeclared: z.boolean(),
    storageIt: z.string().max(2000).nullable(),
    storageEn: z.string().max(2000).nullable(),
    minShelfLifeDays: z.number().int().min(1).max(3650).nullable(),
    isPerishable: z.boolean(),
    stockStatus: z.enum(STOCK_STATUSES),
    leadTimeDays: z.number().int().min(1).max(60),
    areaId: z.uuid().nullable(),
    placeIds: z.array(z.uuid()).max(20),
    activityIds: z.array(z.uuid()).max(20),
    mediaIds: z.array(z.uuid()).max(12),
    boxItems: z.array(z.object({ productId: z.uuid(), quantity: z.number().int().min(1).max(50) })).max(50),
    isActive: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (!parseAllergens(value.allergens).ok) {
      ctx.addIssue({ code: "custom", path: ["allergens"], message: "unknown_allergen" });
    }
    if (value.isActive && !value.allergensDeclared) {
      ctx.addIssue({ code: "custom", path: ["allergensDeclared"], message: "allergens_not_declared" });
    }
    if (value.category !== "box" && value.boxItems.length > 0) {
      ctx.addIssue({ code: "custom", path: ["boxItems"], message: "box_items_require_box" });
    }
    if (value.id !== null && value.boxItems.some((item) => item.productId === value.id)) {
      ctx.addIssue({ code: "custom", path: ["boxItems"], message: "box_contains_itself" });
    }
  });

function constraintOf(error: unknown): string {
  const cause = (error as { cause?: { constraint?: unknown } } | null)?.cause;
  return typeof cause?.constraint === "string" ? cause.constraint : "";
}

export const saveProduct: AdminFormAction = async (_prev, formData): Promise<AdminFormState> => {
  const eur = formEurCents(formData, "priceEur");
  const parsed = productInput.safeParse({
    id: idOrNull(formText(formData, "id")),
    slug: formText(formData, "slug").toLowerCase(),
    supplierId: formText(formData, "supplierId"),
    producerId: formText(formData, "producerId"),
    supplierSku: emptyToNull(formOptionalText(formData, "supplierSku")),
    titleIt: formText(formData, "titleIt"),
    titleEn: emptyToNull(formOptionalText(formData, "titleEn")),
    category: formText(formData, "category"),
    formatLabel: emptyToNull(formOptionalText(formData, "formatLabel")),
    priceCents: eur,
    costCents: formEurCents(formData, "costEur"),
    vatRate: formInteger(formData, "vatRate"),
    descriptionIt: emptyToNull(formOptionalText(formData, "descriptionIt")),
    descriptionEn: emptyToNull(formOptionalText(formData, "descriptionEn")),
    ingredientsIt: emptyToNull(formOptionalText(formData, "ingredientsIt")),
    ingredientsEn: emptyToNull(formOptionalText(formData, "ingredientsEn")),
    allergens: formList(formData, "allergens"),
    allergensDeclared: formFlag(formData, "allergensDeclared"),
    storageIt: emptyToNull(formOptionalText(formData, "storageIt")),
    storageEn: emptyToNull(formOptionalText(formData, "storageEn")),
    minShelfLifeDays: formInteger(formData, "minShelfLifeDays"),
    isPerishable: formFlag(formData, "isPerishable"),
    stockStatus: formText(formData, "stockStatus"),
    leadTimeDays: formInteger(formData, "leadTimeDays") ?? 0,
    areaId: idOrNull(formText(formData, "areaId")),
    placeIds: uuidList(formList(formData, "placeIds")),
    activityIds: uuidList(formList(formData, "activityIds")),
    mediaIds: formList(formData, "mediaIds"),
    boxItems: formBoxItems(formData),
    isActive: formFlag(formData, "isActive"),
  });
  if (!parsed.success) return { status: "error", code: "invalid" };
  await requireAdmin();

  const value = parsed.data;
  const allergens = parseAllergens(value.allergens);
  if (!allergens.ok) return { status: "error", code: "invalid" };
  const isBox = value.category === "box";

  const columns = {
    slug: value.slug,
    producerId: value.producerId,
    supplierId: value.supplierId,
    supplierSku: value.supplierSku,
    title: value.titleIt,
    titleEn: value.titleEn,
    description: value.descriptionIt,
    descriptionEn: value.descriptionEn,
    category: value.category,
    formatLabel: value.formatLabel,
    priceCents: value.priceCents,
    costCents: value.costCents,
    vatRate: value.vatRate,
    weightG: null,
    ingredientsIt: value.ingredientsIt,
    ingredientsEn: value.ingredientsEn,
    allergens: allergens.keys,
    allergensDeclared: value.allergensDeclared,
    storageIt: value.storageIt,
    storageEn: value.storageEn,
    minShelfLifeDays: value.minShelfLifeDays,
    isPerishable: value.isPerishable,
    stockStatus: value.stockStatus,
    leadTimeDays: value.leadTimeDays,
    areaId: value.areaId,
    coverMediaId: value.mediaIds[0] ?? null,
    isBox,
    isActive: value.isActive,
  };

  try {
    const saved = await dbAdmin.transaction(async (tx) => {
      const [row] = value.id
        ? await tx.update(products).set(columns).where(eq(products.id, value.id)).returning({ id: products.id })
        : await tx.insert(products).values(columns).returning({ id: products.id });
      if (!row) return false;

      await tx.delete(productMedia).where(eq(productMedia.productId, row.id));
      if (value.mediaIds.length > 0) {
        await tx.insert(productMedia).values(
          value.mediaIds.map((mediaId, position) => ({ productId: row.id, mediaId, position })),
        );
      }

      const links = [
        ...value.placeIds.map((targetId, position) => ({ productId: row.id, kind: "place" as const, targetId, position })),
        ...value.activityIds.map((targetId, position) => ({ productId: row.id, kind: "activity" as const, targetId, position })),
      ];
      await tx.delete(productLinks).where(eq(productLinks.productId, row.id));
      if (links.length > 0) await tx.insert(productLinks).values(links);

      // Dopo la riga del prodotto: il trigger box_items_box_is_box controlla che la box sia marcata.
      await tx.delete(boxItems).where(eq(boxItems.boxId, row.id));
      if (isBox && value.boxItems.length > 0) {
        await tx.insert(boxItems).values(
          value.boxItems.map((item) => ({ boxId: row.id, productId: item.productId, quantity: item.quantity })),
        );
      }
      return true;
    });
    if (!saved) return { status: "error", code: "invalid" };
    revalidatePath(PRODUCTS_PATH);
    return { status: "saved" };
  } catch (error) {
    const { sqlstate, message } = dbErrorCode(error);
    console.error("saveProduct", sqlstate, message === "product_link_target_missing" || message === "box_not_box" ? message : "");
    if (sqlstate === "23505") {
      return { status: "error", code: constraintOf(error).includes("slug") ? "slug_taken" : "invalid" };
    }
    if (sqlstate === "P0001" || sqlstate === "23514" || sqlstate === "23503") return { status: "error", code: "invalid" };
    return { status: "error", code: "failed" };
  }
};

export async function listProductsAdmin(): Promise<
  { id: string; slug: string; titleIt: string; category: string; priceCents: number; stockStatus: string; isActive: boolean; producerName: string }[]
> {
  await requireAdmin();
  const rows = await dbAdmin
    .select({
      id: products.id,
      slug: products.slug,
      titleIt: products.title,
      category: products.category,
      priceCents: products.priceCents,
      stockStatus: products.stockStatus,
      isActive: products.isActive,
      producerName: producers.name,
    })
    .from(products)
    .innerJoin(producers, eq(producers.id, products.producerId))
    .orderBy(asc(products.title));
  return rows;
}

// Scheda per il modulo di modifica (con costo e codice del fornitore: solo admin). Null se non esiste.
export async function getProductAdmin(id: string): Promise<ProductFormValues | null> {
  await requireAdmin();
  const [row] = await dbAdmin.select().from(products).where(eq(products.id, id));
  if (!row) return null;
  const [gallery, links, items] = await Promise.all([
    dbAdmin
      .select({ mediaId: productMedia.mediaId })
      .from(productMedia)
      .where(eq(productMedia.productId, id))
      .orderBy(asc(productMedia.position)),
    dbAdmin
      .select({ kind: productLinks.kind, targetId: productLinks.targetId })
      .from(productLinks)
      .where(eq(productLinks.productId, id))
      .orderBy(asc(productLinks.position)),
    dbAdmin.select({ productId: boxItems.productId, quantity: boxItems.quantity }).from(boxItems).where(eq(boxItems.boxId, id)),
  ]);
  const allergens = parseAllergens(row.allergens);
  return {
    id: row.id,
    slug: row.slug,
    supplierId: row.supplierId,
    producerId: row.producerId,
    supplierSku: row.supplierSku,
    titleIt: row.title,
    titleEn: row.titleEn,
    category: row.category as ProductFormValues["category"],
    formatLabel: row.formatLabel,
    priceCents: row.priceCents,
    costCents: row.costCents,
    vatRate: row.vatRate as ProductFormValues["vatRate"],
    descriptionIt: row.description,
    descriptionEn: row.descriptionEn,
    ingredientsIt: row.ingredientsIt,
    ingredientsEn: row.ingredientsEn,
    allergens: allergens.ok ? allergens.keys : [],
    allergensDeclared: row.allergensDeclared,
    storageIt: row.storageIt,
    storageEn: row.storageEn,
    minShelfLifeDays: row.minShelfLifeDays,
    isPerishable: row.isPerishable,
    stockStatus: row.stockStatus as ProductFormValues["stockStatus"],
    leadTimeDays: row.leadTimeDays,
    areaId: row.areaId,
    placeIds: links.filter((l) => l.kind === "place").map((l) => l.targetId),
    activityIds: links.filter((l) => l.kind === "activity").map((l) => l.targetId),
    mediaIds: gallery.map((g) => g.mediaId),
    boxItems: items,
    isActive: row.isActive,
  };
}
