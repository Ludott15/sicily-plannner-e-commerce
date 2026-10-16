"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ProductImportFormAction, ProductImportFormState, ProductImportPreview } from "@/lib/shop/form-values";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { producers, products, suppliers } from "@/server/db/schema";
import { dbErrorCode } from "./action-utils";
import {
  MAX_PRODUCT_IMPORT_BYTES,
  planProductImport,
  type NormalizedProduct,
  type ProductImportLookup,
  type ProductImportPlan,
  type ProductImportRow,
} from "./products-import";
import { formText } from "./form";

// Import CSV dei prodotti di un fornitore (solo admin). Anteprima e salvataggio ricalcolano il piano
// dal file: il salvataggio parte solo se non ci sono errori. Le righe "update" aggiornano i campi del
// CSV; galleria, collegamenti e box non sono nel CSV e restano come sono.

const PRODUCTS_PATH = "/[locale]/admin/prodotti";

const supplierIdSchema = z.uuid();

function issueText(issue: ProductImportRow["issues"][number]): string {
  const column = issue.column ? ` (${issue.column})` : "";
  const value = issue.value ? `: ${issue.value}` : "";
  return `${issue.code}${column}${value}`;
}

function previewOf(plan: Extract<ProductImportPlan, { ok: true }>): ProductImportPreview {
  return {
    totals: plan.counts,
    rows: plan.rows.map((row) => ({
      line: row.line,
      title: row.product?.title ?? row.slug,
      status: row.status,
      issues: row.issues.map(issueText),
    })),
  };
}

async function loadLookup() {
  const [producerRows, productRows] = await Promise.all([
    dbAdmin.select({ id: producers.id, slug: producers.slug }).from(producers),
    dbAdmin.select({ slug: products.slug }).from(products),
  ]);
  const producerIds = new Map(producerRows.map((p) => [p.slug, p.id] as const));
  const lookup: ProductImportLookup = {
    producerSlugs: new Set(producerIds.keys()),
    existingProductSlugs: new Set(productRows.map((p) => p.slug)),
  };
  return { lookup, producerIds };
}

type ReadFile = { ok: true; text: string } | { ok: false; code: "invalid_file" };

async function readCsv(formData: FormData): Promise<ReadFile> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, code: "invalid_file" };
  if (file.size > MAX_PRODUCT_IMPORT_BYTES || !file.name.toLowerCase().endsWith(".csv")) {
    return { ok: false, code: "invalid_file" };
  }
  return { ok: true, text: await file.text() };
}

export const importProducts: ProductImportFormAction = async (_prev, formData): Promise<ProductImportFormState> => {
  const intent = formText(formData, "intent");
  if (intent !== "preview" && intent !== "commit") return { status: "error", code: "failed" };
  const supplierId = supplierIdSchema.safeParse(formText(formData, "supplierId"));
  if (!supplierId.success) return { status: "error", code: "failed" };
  const file = await readCsv(formData);
  if (!file.ok) return { status: "error", code: "invalid_file" };

  await requireAdmin();

  try {
    const [supplier] = await dbAdmin
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId.data));
    if (!supplier) return { status: "error", code: "failed" };

    const { lookup, producerIds } = await loadLookup();
    const plan = planProductImport(file.text, lookup);
    if (!plan.ok) {
      if (plan.error === "header_missing_columns") {
        return { status: "error", code: "missing_columns", columns: plan.columns ?? [] };
      }
      return { status: "error", code: "invalid_file" };
    }

    if (intent === "preview" || plan.counts.error > 0) {
      return { status: "preview", preview: previewOf(plan) };
    }

    const rows = plan.rows.flatMap((row) => (row.product ? [row.product] : []));
    await dbAdmin.transaction(async (tx) => {
      for (const p of rows) {
        const producerId = producerIds.get(p.producerSlug);
        if (!producerId) throw new Error("import_producer_missing");
        await tx
          .insert(products)
          .values(toRow(p, supplier.id, producerId))
          .onConflictDoUpdate({ target: products.slug, set: updateSet(p, supplier.id, producerId) });
      }
    });
    revalidatePath(PRODUCTS_PATH);
    return { status: "imported", created: plan.counts.create, updated: plan.counts.update };
  } catch (error) {
    console.error("importProducts", dbErrorCode(error).sqlstate);
    return { status: "error", code: "failed" };
  }
};

function toRow(p: NormalizedProduct, supplierId: string, producerId: string) {
  return {
    slug: p.slug,
    producerId,
    supplierId,
    supplierSku: p.supplierSku,
    title: p.title,
    titleEn: p.titleEn,
    description: p.description,
    descriptionEn: null,
    category: p.category,
    formatLabel: p.formatLabel,
    priceCents: p.priceCents,
    costCents: p.costCents,
    vatRate: p.vatRate,
    weightG: p.weightG,
    ingredientsIt: p.ingredients,
    allergens: p.allergens,
    storageIt: p.storage,
    isPerishable: p.isPerishable,
    minShelfLifeDays: p.minShelfLifeDays,
    stockStatus: p.stockStatus,
    leadTimeDays: p.leadTimeDays,
    isActive: p.isActive,
  };
}

function updateSet(p: NormalizedProduct, supplierId: string, producerId: string) {
  const row = toRow(p, supplierId, producerId);
  return {
    producerId: row.producerId,
    supplierId: row.supplierId,
    supplierSku: row.supplierSku,
    title: row.title,
    titleEn: row.titleEn,
    description: row.description,
    category: row.category,
    formatLabel: row.formatLabel,
    priceCents: row.priceCents,
    costCents: row.costCents,
    vatRate: row.vatRate,
    weightG: row.weightG,
    ingredientsIt: row.ingredientsIt,
    allergens: row.allergens,
    storageIt: row.storageIt,
    isPerishable: row.isPerishable,
    minShelfLifeDays: row.minShelfLifeDays,
    stockStatus: row.stockStatus,
    leadTimeDays: row.leadTimeDays,
    isActive: row.isActive,
  };
}
