// Import CSV dei prodotti dal catalogo del fornitore scelto nel form: lettura e validazione pura
// (nessun DB). products-import.admin.ts risolve i produttori dal database, poi chiama
// planProductImport; il salvataggio parte solo senza errori.

import { CsvParseError, parseCsv } from "@/lib/catalog-import/csv";
import { parseAllergens, type Allergen } from "@/lib/shop/allergens";
import { PRODUCT_CATEGORIES, STOCK_STATUSES, type ProductCategory, type StockStatus, type VatRate } from "@/lib/shop/config";

export const PRODUCT_IMPORT_COLUMNS = [
  "slug",
  "supplier_sku",
  "producer_slug",
  "title_it",
  "title_en",
  "description_it",
  "category",
  "format_label",
  "price_eur",
  "cost_eur",
  "vat_rate",
  "weight_g",
  "ingredients_it",
  "allergens",
  "storage_it",
  "is_perishable",
  "min_shelf_life_days",
  "stock_status",
  "lead_time_days",
  "is_active",
] as const;

export type ProductImportColumn = (typeof PRODUCT_IMPORT_COLUMNS)[number];

export const REQUIRED_PRODUCT_IMPORT_COLUMNS: readonly ProductImportColumn[] = [
  "slug",
  "supplier_sku",
  "producer_slug",
  "title_it",
  "category",
  "price_eur",
  "vat_rate",
];

export const MAX_PRODUCT_IMPORT_ROWS = 500;
export const MAX_PRODUCT_IMPORT_BYTES = 1_000_000;

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type ProductImportIssueCode =
  | "missing_value"
  | "invalid_slug"
  | "invalid_price"
  | "invalid_integer"
  | "invalid_choice"
  | "invalid_bool"
  | "value_too_long"
  | "unknown_allergen"
  | "unknown_producer"
  | "duplicate_slug"
  | "duplicate_sku"
  | "wrong_column_count";

export type ProductImportIssue = {
  code: ProductImportIssueCode;
  column?: ProductImportColumn;
  value?: string;
};

export type ProductImportFileError = "header_invalid" | "header_missing_columns" | "too_many_rows" | "empty_file";

export type NormalizedProduct = {
  slug: string;
  producerSlug: string;
  supplierSku: string;
  title: string;
  titleEn: string | null;
  description: string | null;
  category: ProductCategory;
  formatLabel: string | null;
  priceCents: number;
  costCents: number | null;
  vatRate: VatRate;
  weightG: number | null;
  ingredients: string | null;
  allergens: Allergen[];
  storage: string | null;
  isPerishable: boolean;
  minShelfLifeDays: number | null;
  stockStatus: StockStatus;
  leadTimeDays: number;
  isActive: boolean;
};

export type ProductImportRowStatus = "create" | "update" | "error";

export type ProductImportRow = {
  line: number;
  slug: string;
  status: ProductImportRowStatus;
  issues: ProductImportIssue[];
  product: NormalizedProduct | null;
};

export type ProductImportPlan =
  | { ok: false; error: ProductImportFileError; columns?: string[] }
  | { ok: true; rows: ProductImportRow[]; counts: { create: number; update: number; error: number } };

// Riferimenti risolti dal database prima della validazione.
export type ProductImportLookup = {
  producerSlugs: ReadonlySet<string>;
  existingProductSlugs: ReadonlySet<string>;
};

// Intestazione: colonne in qualsiasi ordine, maiuscole ignorate; le colonne sconosciute si respingono.
export function checkProductImportHeader(
  header: readonly string[],
): { ok: true } | { ok: false; error: ProductImportFileError; columns?: string[] } {
  const normalized = header.map((h) => h.trim().toLowerCase());
  if (normalized.every((h) => h === "")) return { ok: false, error: "header_invalid" };
  const unknown = normalized.filter((h) => h !== "" && !(PRODUCT_IMPORT_COLUMNS as readonly string[]).includes(h));
  if (unknown.length > 0) return { ok: false, error: "header_invalid", columns: unknown };
  const missing = REQUIRED_PRODUCT_IMPORT_COLUMNS.filter((c) => !normalized.includes(c));
  if (missing.length > 0) return { ok: false, error: "header_missing_columns", columns: missing };
  return { ok: true };
}

// Euro in testo ("12,90", "12.9", "12") in centesimi; null se non è un importo valido (massimo due decimali).
export function parseEuroToCents(raw: string): number | null {
  const value = raw.trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function parseInteger(raw: string, min: number, max: number): number | null {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

function parseBool(raw: string): boolean | null {
  const value = raw.trim().toLowerCase();
  if (value === "") return false;
  if (["si", "sì", "s", "yes", "y", "true", "1"].includes(value)) return true;
  if (["no", "n", "false", "0"].includes(value)) return false;
  return null;
}

function optionalText(raw: string, max: number): string | null {
  const value = raw.trim();
  return value === "" ? null : value.slice(0, max);
}

function readCell(cells: readonly string[], index: number | undefined): string {
  return index === undefined ? "" : (cells[index] ?? "");
}

type ParseOutcome = { product: NormalizedProduct | null; issues: ProductImportIssue[] };

// Valida una riga con le stesse regole dei check SQL e dell'azione di salvataggio.
export function normalizeProductRow(cells: readonly string[], index: Partial<Record<ProductImportColumn, number>>): ParseOutcome {
  const issues: ProductImportIssue[] = [];
  const get = (column: ProductImportColumn): string => readCell(cells, index[column]).trim();
  const required = (column: ProductImportColumn): string => {
    const value = get(column);
    if (value === "") issues.push({ code: "missing_value", column });
    return value;
  };

  const slug = required("slug").toLowerCase();
  if (slug !== "" && (!SLUG_PATTERN.test(slug) || slug.length > 120)) issues.push({ code: "invalid_slug", column: "slug", value: slug });

  const supplierSku = required("supplier_sku");
  if (supplierSku.length > 80) issues.push({ code: "value_too_long", column: "supplier_sku" });

  const producerSlug = required("producer_slug").toLowerCase();
  const titleIt = required("title_it");
  if (titleIt.length > 200) issues.push({ code: "value_too_long", column: "title_it" });

  const categoryRaw = required("category").toLowerCase();
  const category = (PRODUCT_CATEGORIES as readonly string[]).includes(categoryRaw) ? (categoryRaw as ProductCategory) : null;
  if (categoryRaw !== "" && category === null) issues.push({ code: "invalid_choice", column: "category", value: categoryRaw });

  const priceRaw = required("price_eur");
  const priceCents = priceRaw === "" ? null : parseEuroToCents(priceRaw);
  if (priceRaw !== "" && priceCents === null) issues.push({ code: "invalid_price", column: "price_eur", value: priceRaw });

  const costRaw = get("cost_eur");
  const costCents = costRaw === "" ? null : parseEuroToCents(costRaw);
  if (costRaw !== "" && costCents === null) issues.push({ code: "invalid_price", column: "cost_eur", value: costRaw });

  const vatRaw = required("vat_rate");
  const vat = vatRaw === "" ? null : parseInteger(vatRaw, 0, 100);
  const vatRate = vat === 4 || vat === 10 || vat === 22 ? (vat as VatRate) : null;
  if (vatRaw !== "" && vatRate === null) issues.push({ code: "invalid_choice", column: "vat_rate", value: vatRaw });

  const weightRaw = get("weight_g");
  const weightG = weightRaw === "" ? null : parseInteger(weightRaw, 1, 1_000_000);
  if (weightRaw !== "" && weightG === null) issues.push({ code: "invalid_integer", column: "weight_g", value: weightRaw });

  const leadRaw = get("lead_time_days");
  const leadTimeDays = leadRaw === "" ? 3 : parseInteger(leadRaw, 1, 60);
  if (leadRaw !== "" && leadTimeDays === null) issues.push({ code: "invalid_integer", column: "lead_time_days", value: leadRaw });

  const minShelfRaw = get("min_shelf_life_days");
  const minShelfLifeDays = minShelfRaw === "" ? null : parseInteger(minShelfRaw, 1, 3650);
  if (minShelfRaw !== "" && minShelfLifeDays === null) issues.push({ code: "invalid_integer", column: "min_shelf_life_days", value: minShelfRaw });

  const stockRaw = get("stock_status").toLowerCase();
  const stockStatus: StockStatus | null =
    stockRaw === "" ? "available" : (STOCK_STATUSES as readonly string[]).includes(stockRaw) ? (stockRaw as StockStatus) : null;
  if (stockStatus === null) issues.push({ code: "invalid_choice", column: "stock_status", value: stockRaw });

  const perishable = parseBool(get("is_perishable"));
  if (perishable === null) issues.push({ code: "invalid_bool", column: "is_perishable", value: get("is_perishable") });
  const active = parseBool(get("is_active"));
  if (active === null) issues.push({ code: "invalid_bool", column: "is_active", value: get("is_active") });

  const allergenRaw = get("allergens");
  const allergenParse = parseAllergens(allergenRaw === "" ? [] : allergenRaw.split(/[;,|]/));
  if (!allergenParse.ok) {
    for (const value of allergenParse.unknown) issues.push({ code: "unknown_allergen", column: "allergens", value });
  }

  if (
    issues.length > 0 ||
    priceCents === null ||
    vatRate === null ||
    category === null ||
    stockStatus === null ||
    perishable === null ||
    active === null ||
    leadTimeDays === null ||
    !allergenParse.ok
  ) {
    return { product: null, issues };
  }

  return {
    product: {
      slug,
      producerSlug,
      supplierSku,
      title: titleIt,
      titleEn: optionalText(get("title_en"), 200),
      description: optionalText(get("description_it"), 2000),
      category,
      formatLabel: optionalText(get("format_label"), 80),
      priceCents,
      costCents,
      vatRate,
      weightG,
      ingredients: optionalText(get("ingredients_it"), 2000),
      allergens: allergenParse.keys,
      storage: optionalText(get("storage_it"), 2000),
      isPerishable: perishable,
      minShelfLifeDays,
      stockStatus,
      leadTimeDays,
      isActive: active,
    },
    issues: [],
  };
}

// Piano dell'import: una riga per riga del file, con stato create/update/error. Non scrive nulla.
// Uno slug o un codice fornitore ripetuti nel file: la prima riga vale, le successive sono errori.
export function planProductImport(text: string, lookup: ProductImportLookup): ProductImportPlan {
  let document: ReturnType<typeof parseCsv>;
  try {
    document = parseCsv(text);
  } catch (error) {
    if (error instanceof CsvParseError) return { ok: false, error: "header_invalid" };
    throw error;
  }
  if (document.header.length === 0) return { ok: false, error: "empty_file" };
  const header = checkProductImportHeader(document.header);
  if (!header.ok) return header;
  if (document.rows.length === 0) return { ok: false, error: "empty_file" };
  if (document.rows.length > MAX_PRODUCT_IMPORT_ROWS) return { ok: false, error: "too_many_rows" };

  const index: Partial<Record<ProductImportColumn, number>> = {};
  document.header.forEach((name, position) => {
    const key = name.trim().toLowerCase() as ProductImportColumn;
    if ((PRODUCT_IMPORT_COLUMNS as readonly string[]).includes(key)) index[key] = position;
  });

  const seenSlugs = new Set<string>();
  const seenSkus = new Set<string>();
  const rows: ProductImportRow[] = [];
  for (const record of document.rows) {
    if (record.cells.length > document.header.length) {
      rows.push({ line: record.line, slug: "", status: "error", issues: [{ code: "wrong_column_count" }], product: null });
      continue;
    }
    const outcome = normalizeProductRow(record.cells, index);
    const issues = [...outcome.issues];
    const product = outcome.product;
    const slug = product?.slug ?? readCell(record.cells, index.slug).trim().toLowerCase();

    if (product) {
      if (seenSlugs.has(product.slug)) issues.push({ code: "duplicate_slug", column: "slug", value: product.slug });
      if (seenSkus.has(product.supplierSku)) issues.push({ code: "duplicate_sku", column: "supplier_sku", value: product.supplierSku });
      seenSkus.add(product.supplierSku);
      seenSlugs.add(product.slug);
      if (!lookup.producerSlugs.has(product.producerSlug)) {
        issues.push({ code: "unknown_producer", column: "producer_slug", value: product.producerSlug });
      }
    }

    const status: ProductImportRowStatus =
      issues.length > 0 || product === null ? "error" : lookup.existingProductSlugs.has(slug) ? "update" : "create";
    rows.push({ line: record.line, slug, status, issues, product: issues.length > 0 ? null : product });
  }

  const counts = { create: 0, update: 0, error: 0 };
  for (const row of rows) counts[row.status] += 1;
  return { ok: true, rows, counts };
}
