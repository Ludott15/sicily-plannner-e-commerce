import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALLERGENS } from "./allergens";
import { PRODUCT_CATEGORIES, PRODUCT_LINK_KINDS, STOCK_STATUSES, SUPPLIER_KINDS } from "./config";

// I check SQL dello schema Drizzle ripetono i vocabolari TypeScript: se divergono, il DB rifiuta
// valori che l'app accetta (o il contrario). Il test confronta i due elenchi.
const schemaSource = readFileSync(fileURLToPath(new URL("../../server/db/schema/shop.ts", import.meta.url)), "utf8");

function quotedList(constName: string): string[] {
  const match = new RegExp(`const ${constName} =\\s*"([^"]+)"`).exec(schemaSource);
  if (!match) throw new Error(`costante ${constName} non trovata nello schema`);
  return (match[1] ?? "").split(",").map((item) => item.trim().replace(/^'|'$/g, ""));
}

describe("vocabolari dello schema shop", () => {
  it("categorie di prodotto", () => {
    expect(quotedList("CATEGORY_SQL")).toEqual([...PRODUCT_CATEGORIES]);
  });

  it("disponibilità", () => {
    expect(quotedList("STOCK_SQL")).toEqual([...STOCK_STATUSES]);
  });

  it("allergeni", () => {
    expect(quotedList("ALLERGEN_SQL")).toEqual([...ALLERGENS]);
  });

  it("tipi di fornitore e collegamenti sono nei check della tabella", () => {
    for (const kind of SUPPLIER_KINDS) expect(schemaSource).toContain(`'${kind}'`);
    for (const kind of PRODUCT_LINK_KINDS) expect(schemaSource).toContain(`'${kind}'`);
  });
});
