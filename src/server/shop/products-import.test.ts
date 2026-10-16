import { describe, expect, it } from "vitest";
import {
  checkProductImportHeader,
  MAX_PRODUCT_IMPORT_ROWS,
  parseEuroToCents,
  planProductImport,
  type ProductImportLookup,
} from "./products-import";

const SUPPLIER = "a0000000-0000-0000-0000-000000000001";
const OTHER_SUPPLIER = "a0000000-0000-0000-0000-000000000002";

const HEADER = [
  "slug",
  "supplier_sku",
  "producer_slug",
  "title_it",
  "category",
  "format_label",
  "price_eur",
  "cost_eur",
  "vat_rate",
  "weight_g",
  "ingredients_it",
  "allergens",
  "allergens_declared",
  "is_perishable",
  "is_active",
].join(",");

const lookup: ProductImportLookup = {
  supplierId: SUPPLIER,
  producerSlugs: new Set(["pistacchi-bronte"]),
  existingProducts: new Map([
    ["crema-pistacchio", SUPPLIER],
    ["prodotto-altrui", OTHER_SUPPLIER],
  ]),
  supplierSkuOwners: new Map([
    ["SKU-OLD", "crema-pistacchio"],
    ["SKU-TAKEN", "prodotto-gia-presente"],
  ]),
};

function csv(...lines: string[]): string {
  return [HEADER, ...lines].join("\n");
}

// Riga completa e valida (prodotto attivo, con ingredienti, formato e allergeni dichiarati).
const VALID = "pasta-grano-antico,SKU-1,pistacchi-bronte,Pasta di grano antico,pasta,pacco 500 g,9.90,4.50,4,500,Semola di grano duro,\"gluten, milk\",si,no,si";

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
  it("una riga valida diventa create, una esistente dello stesso fornitore update", () => {
    const plan = planProductImport(
      csv(
        VALID,
        "crema-pistacchio,SKU-2,pistacchi-bronte,Crema,dolci,vasetto 190 g,12.90,6.90,4,220,Pistacchi,nuts,si,no,si",
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
      allergensDeclared: true,
      isActive: true,
      stockStatus: "available",
      leadTimeDays: 3,
    });
    expect(plan.counts).toEqual({ create: 1, update: 1, error: 0 });
  });

  it("il peso è facoltativo", () => {
    const plan = planProductImport(csv("uno,SKU-1,pistacchi-bronte,Uno,dolci,pacco,10,,4,,Farina,,no,no,no"), lookup);
    if (!plan.ok) throw new Error("file non valido");
    expect(plan.rows[0]?.product?.weightG).toBeNull();
  });

  it("segnala errori per riga senza bloccare le altre", () => {
    const plan = planProductImport(
      csv(
        "Slug Sbagliato,SKU-1,pistacchi-bronte,Titolo,dolci,pacco,10,,5,100,Farina,,no,no,no",
        "ok-prodotto,SKU-2,pistacchi-bronte,Titolo,dolci,pacco,10,,4,100,Farina,latte,no,no,no",
        "altro-prodotto,SKU-3,produttore-ignoto,Titolo,dolci,pacco,10,,22,100,Farina,,no,no,no",
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

  it("un prodotto attivo che non è una box richiede ingredienti e formato", () => {
    const plan = planProductImport(
      csv(
        "uno,SKU-1,pistacchi-bronte,Uno,dolci,,10,,4,100,,,si,no,si",
        "due,SKU-2,pistacchi-bronte,Due,dolci,pacco,10,,4,100,,,si,no,si",
      ),
      lookup,
    );
    if (!plan.ok) throw new Error("file non valido");
    expect(plan.rows[0]?.issues).toEqual([
      { code: "missing_value", column: "ingredients_it" },
      { code: "missing_value", column: "format_label" },
    ]);
    expect(plan.rows[1]?.issues).toEqual([{ code: "missing_value", column: "ingredients_it" }]);
  });

  it("una box attiva non richiede ingredienti (la composizione sta nei componenti)", () => {
    const plan = planProductImport(csv("box-sicilia,SKU-B,pistacchi-bronte,Box,box,,35,,10,,,,si,no,si"), lookup);
    if (!plan.ok) throw new Error("file non valido");
    expect(plan.rows[0]?.issues).toEqual([]);
  });

  it("un prodotto attivo richiede gli allergeni dichiarati", () => {
    const plan = planProductImport(csv("uno,SKU-1,pistacchi-bronte,Uno,dolci,pacco,10,,4,100,Farina,,no,no,si"), lookup);
    if (!plan.ok) throw new Error("file non valido");
    expect(plan.rows[0]?.issues).toEqual([{ code: "allergens_not_declared", column: "allergens_declared" }]);
  });

  it("uno slug di un altro fornitore è un errore", () => {
    const plan = planProductImport(csv("prodotto-altrui,SKU-9,pistacchi-bronte,Uno,dolci,pacco,10,,4,100,Farina,,si,no,no"), lookup);
    if (!plan.ok) throw new Error("file non valido");
    expect(plan.rows[0]?.status).toBe("error");
    expect(plan.rows[0]?.issues).toEqual([{ code: "slug_other_supplier", column: "slug", value: "prodotto-altrui" }]);
  });

  it("un codice fornitore già usato da un altro prodotto dello stesso fornitore è un errore", () => {
    const plan = planProductImport(
      csv(
        "nuovo-slug,SKU-TAKEN,pistacchi-bronte,Uno,dolci,pacco,10,,4,100,Farina,,si,no,no",
        "crema-pistacchio,SKU-OLD,pistacchi-bronte,Crema,dolci,pacco,10,,4,100,Farina,,si,no,no",
      ),
      lookup,
    );
    if (!plan.ok) throw new Error("file non valido");
    expect(plan.rows[0]?.issues).toEqual([{ code: "duplicate_sku", column: "supplier_sku", value: "SKU-TAKEN" }]);
    expect(plan.rows[1]?.status).toBe("update");
  });

  it("rifiuta slug e codice fornitore duplicati nel file, tenendo la prima riga", () => {
    const plan = planProductImport(
      csv(
        "uno,SKU-1,pistacchi-bronte,Uno,dolci,pacco,10,,4,100,Farina,,si,no,no",
        "uno,SKU-2,pistacchi-bronte,Due,dolci,pacco,10,,4,100,Farina,,si,no,no",
        "tre,SKU-1,pistacchi-bronte,Tre,dolci,pacco,10,,4,100,Farina,,si,no,no",
      ),
      lookup,
    );
    if (!plan.ok) throw new Error("file non valido");
    expect(plan.rows[0]?.status).toBe("create");
    expect(plan.rows[1]?.issues[0]?.code).toBe("duplicate_slug");
    expect(plan.rows[2]?.issues[0]?.code).toBe("duplicate_sku");
  });

  it("valida i booleani", () => {
    const plan = planProductImport(csv("uno,SKU-1,pistacchi-bronte,Uno,dolci,pacco,10,,4,100,Farina,,si,forse,no"), lookup);
    if (!plan.ok) throw new Error("file non valido");
    expect(plan.rows[0]?.issues).toEqual([{ code: "invalid_bool", column: "is_perishable", value: "forse" }]);
  });

  it("respinge file vuoti e troppe righe", () => {
    expect(planProductImport(HEADER, lookup)).toEqual({ ok: false, error: "empty_file" });
    const many = Array.from(
      { length: MAX_PRODUCT_IMPORT_ROWS + 1 },
      (_, i) => `p-${i},S-${i},pistacchi-bronte,T,dolci,pacco,1,,4,1,Farina,,si,no,no`,
    );
    expect(planProductImport(csv(...many), lookup)).toEqual({ ok: false, error: "too_many_rows" });
  });
});
