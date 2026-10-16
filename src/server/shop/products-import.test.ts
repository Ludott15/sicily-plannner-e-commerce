import { describe, expect, it } from "vitest";
import {
  checkProductImportHeader,
  MAX_PRODUCT_IMPORT_ROWS,
  parseEuroToCents,
  planProductImport,
  type ProductImportLookup,
} from "./products-import";

const HEADER = [
  "slug",
  "supplier_sku",
  "producer_slug",
  "title_it",
  "category",
  "price_eur",
  "cost_eur",
  "vat_rate",
  "weight_g",
  "allergens",
  "is_perishable",
  "is_active",
].join(",");

const lookup: ProductImportLookup = {
  producerSlugs: new Set(["pistacchi-bronte"]),
  existingProductSlugs: new Set(["crema-pistacchio"]),
};

function csv(...lines: string[]): string {
  return [HEADER, ...lines].join("\n");
}

describe("parseEuroToCents", () => {
  it.each([
    ["12", 1200],
    ["12.9", 1290],
    ["12,90", 1290],
    ["0,05", 5],
    [" 7.25 ", 725],
  ])("%s -> %i", (raw, cents) => {
    expect(parseEuroToCents(raw)).toBe(cents);
  });

  it.each(["", "12.345", "-1", "dodici", "1,2,3"])("rifiuta %s", (raw) => {
    expect(parseEuroToCents(raw)).toBeNull();
  });
});

describe("checkProductImportHeader", () => {
  it("accetta l'intestazione minima con colonne in qualsiasi ordine e maiuscole", () => {
    const header = ["Price_EUR", "SLUG", "supplier_sku", "producer_slug", "title_it", "category", "vat_rate"];
    expect(checkProductImportHeader(header)).toEqual({ ok: true });
  });

  it("segnala le colonne obbligatorie mancanti", () => {
    expect(checkProductImportHeader(["slug", "title_it"])).toEqual({
      ok: false,
      error: "header_missing_columns",
      columns: ["supplier_sku", "producer_slug", "category", "price_eur", "vat_rate"],
    });
  });

  it("respinge le colonne sconosciute", () => {
    const header = ["slug", "supplier_sku", "producer_slug", "title_it", "category", "price_eur", "vat_rate", "stock_qty"];
    expect(checkProductImportHeader(header)).toEqual({ ok: false, error: "header_invalid", columns: ["stock_qty"] });
  });
});

describe("planProductImport", () => {
  it("una riga valida diventa create, una esistente update", () => {
    const plan = planProductImport(
      csv(
        "pasta-grano-antico,SKU-1,pistacchi-bronte,Pasta di grano antico,pasta,9.90,4.50,4,500,\"gluten, milk\",no,si",
        "crema-pistacchio,SKU-2,pistacchi-bronte,Crema,dolci,12.90,6.90,4,220,nuts,no,si",
      ),
      lookup,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.rows.map((r) => r.status)).toEqual(["create", "update"]);
    expect(plan.rows[0]?.product).toMatchObject({
      slug: "pasta-grano-antico",
      priceCents: 990,
      costCents: 450,
      vatRate: 4,
      weightG: 500,
      allergens: ["gluten", "milk"],
      isActive: true,
      stockStatus: "available",
      leadTimeDays: 3,
    });
    expect(plan.counts).toEqual({ create: 1, update: 1, error: 0 });
  });

  it("il peso è facoltativo", () => {
    const plan = planProductImport(csv("uno,SKU-1,pistacchi-bronte,Uno,dolci,10,,4,,,no,si"), lookup);
    if (!plan.ok) throw new Error("file non valido");
    expect(plan.rows[0]?.product?.weightG).toBeNull();
  });

  it("segnala errori per riga senza bloccare le altre", () => {
    const plan = planProductImport(
      csv(
        "Slug Sbagliato,SKU-1,pistacchi-bronte,Titolo,dolci,10,,5,100,,no,si",
        "ok-prodotto,SKU-2,pistacchi-bronte,Titolo,dolci,10,,4,100,latte,no,si",
        "altro-prodotto,SKU-3,produttore-ignoto,Titolo,dolci,10,,22,100,,no,si",
      ),
      lookup,
    );
    if (!plan.ok) throw new Error("file non valido");
    expect(plan.rows[0]?.status).toBe("error");
    expect(plan.rows[0]?.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["invalid_slug", "invalid_choice"]));
    expect(plan.rows[1]?.issues).toEqual([{ code: "unknown_allergen", column: "allergens", value: "latte" }]);
    expect(plan.rows[2]?.issues.map((i) => i.code)).toEqual(["unknown_producer"]);
    expect(plan.counts).toEqual({ create: 0, update: 0, error: 3 });
  });

  it("rifiuta slug e codice fornitore duplicati nel file, tenendo la prima riga", () => {
    const plan = planProductImport(
      csv(
        "uno,SKU-1,pistacchi-bronte,Uno,dolci,10,,4,100,,no,si",
        "uno,SKU-2,pistacchi-bronte,Due,dolci,10,,4,100,,no,si",
        "tre,SKU-1,pistacchi-bronte,Tre,dolci,10,,4,100,,no,si",
      ),
      lookup,
    );
    if (!plan.ok) throw new Error("file non valido");
    expect(plan.rows[0]?.status).toBe("create");
    expect(plan.rows[1]?.issues[0]?.code).toBe("duplicate_slug");
    expect(plan.rows[2]?.issues[0]?.code).toBe("duplicate_sku");
  });

  it("valida i booleani", () => {
    const plan = planProductImport(csv("uno,SKU-1,pistacchi-bronte,Uno,dolci,10,,4,100,,forse,si"), lookup);
    if (!plan.ok) throw new Error("file non valido");
    expect(plan.rows[0]?.issues).toEqual([{ code: "invalid_bool", column: "is_perishable", value: "forse" }]);
  });

  it("respinge file vuoti e troppe righe", () => {
    expect(planProductImport(HEADER, lookup)).toEqual({ ok: false, error: "empty_file" });
    const many = Array.from({ length: MAX_PRODUCT_IMPORT_ROWS + 1 }, (_, i) => `p-${i},S-${i},pistacchi-bronte,T,dolci,1,,4,1,,no,si`);
    expect(planProductImport(csv(...many), lookup)).toEqual({ ok: false, error: "too_many_rows" });
  });
});
