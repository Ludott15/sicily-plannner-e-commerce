import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_POINTS_DISCOUNT_PERCENT, POINTS_PER_EURO } from "./config";

// Le regole dei punti sono costanti in public.checkout_create (migrazione 20261018202120_checkout_rls)
// e in src/lib/shop/config.ts: il test confronta i due valori, come schema-vocabulary.test per lo shop.
const migration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20261018202120_checkout_rls.sql", import.meta.url)),
  "utf8",
);
const cronSource = readFileSync(
  fileURLToPath(new URL("../../server/shop/checkout-sweep.admin.ts", import.meta.url)),
  "utf8",
);

function sqlConstant(name: string): number {
  const match = new RegExp(`${name} constant integer := ([0-9]+);`).exec(migration);
  if (!match?.[1]) throw new Error(`costante ${name} non trovata nella migrazione`);
  return Number(match[1]);
}

describe("regole dei punti nel database", () => {
  it("100 punti per euro, come config.ts", () => {
    expect(sqlConstant("c_points_per_euro")).toBe(POINTS_PER_EURO);
  });

  it("15% massimo del subtotale, come config.ts", () => {
    expect(sqlConstant("c_max_points_percent")).toBe(MAX_POINTS_DISCOUNT_PERCENT);
  });

  it("la funzione di checkout non prende più i valori dal chiamante", () => {
    expect(migration).not.toMatch(/p_points_per_euro|p_max_points_percent/);
  });

  it("lo sweep usa la stessa soglia di 15 minuti della funzione SQL", () => {
    expect(migration).toContain("p_older_than interval default interval '15 minutes'");
    expect(cronSource).toContain("interval '15 minutes'");
  });
});
