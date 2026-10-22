import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { rateLimitHits } from "@/server/db/schema";
import { checkRate, checkRates, rateBucket, type RateRule } from "./rate-limit";

// Limite generico su Postgres locale (npm run test:int): il contatore è public.hit_rate_limit, chiamato
// con il ruolo anon come in produzione. Gli scopi sono int-…: nessuna riga di altre suite viene toccata.
// Le righe di rate_limit_hits hanno bucket HMAC e scadono da sole (la funzione le elimina dopo un giorno).

const SECRET = "int-rate-limit-secret-not-a-secret";
const stamp = Date.now();
// I bucket creati dai test: a fine suite si tolgono le loro righe (il contatore non serve più).
const buckets: string[] = [];

afterAll(async () => {
  if (buckets.length > 0) await dbAdmin.delete(rateLimitHits).where(inArray(rateLimitHits.bucket, buckets));
});

function uniqueRule(limit: number, windowSeconds = 300): RateRule {
  return { scope: `int-rate-${stamp}-${limit}-${windowSeconds}`, limit, windowSeconds };
}

describe("checkRate sul contatore reale", () => {
  it("consente fino al limite e nega dal successivo, per ogni identità separatamente", async () => {
    const rule = uniqueRule(3);
    const ipA = `int-ip-a-${stamp}`;
    const ipB = `int-ip-b-${stamp}`;

    const first = [];
    for (let i = 0; i < 3; i++) first.push(await checkRate(rule, ipA, { secret: SECRET }));
    expect(first).toEqual(["allowed", "allowed", "allowed"]);
    expect(await checkRate(rule, ipA, { secret: SECRET })).toBe("limited");
    expect(await checkRate(rule, ipA, { secret: SECRET })).toBe("limited");

    // Un'altra identità parte da zero: il limite è per IP o per utente, non globale.
    expect(await checkRate(rule, ipB, { secret: SECRET })).toBe("allowed");
  });

  it("conta sul database: la riga del bucket riporta i tentativi, senza identità in chiaro", async () => {
    const rule = uniqueRule(2);
    const identity = `int-email-${stamp}@example.com`;
    for (let i = 0; i < 3; i++) await checkRate(rule, identity, { secret: SECRET });

    const bucket = rateBucket(rule.scope, identity, SECRET);
    buckets.push(bucket);
    expect(bucket).not.toContain("example.com");
    const rows = await dbAdmin.select({ hits: rateLimitHits.hits }).from(rateLimitHits).where(eq(rateLimitHits.bucket, bucket));
    expect(rows.map((row) => row.hits)).toEqual([3]);
  });

  it("fail closed: un contatore non valido (limite 0) dà unavailable, mai allowed", async () => {
    const invalid: RateRule = { scope: `int-rate-invalid-${stamp}`, limit: 0, windowSeconds: 60 };
    expect(await checkRate(invalid, `int-ip-x-${stamp}`, { secret: SECRET })).toBe("unavailable");
  });

  it("checkRates nega se un contatore dice limited, anche con gli altri sotto il limite", async () => {
    const byIp = uniqueRule(1);
    const byEmail = { ...uniqueRule(5), scope: `${byIp.scope}-mail` };
    const ip = `int-ip-combo-${stamp}`;
    const email = `int-combo-${stamp}@example.com`;
    expect(await checkRates([{ rule: byIp, identity: ip }, { rule: byEmail, identity: email }], { secret: SECRET })).toBe(
      "allowed",
    );
    expect(await checkRates([{ rule: byIp, identity: ip }, { rule: byEmail, identity: email }], { secret: SECRET })).toBe(
      "limited",
    );
  });
});
