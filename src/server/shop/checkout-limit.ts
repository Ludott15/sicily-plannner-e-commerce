import "server-only";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { rateLimitSecret } from "@/server/affiliates/config";
import { clientIp } from "@/server/affiliates/rate-key";
import { dbPublic } from "@/server/db/public";
import { checkoutLimitChecks } from "./checkout-limit-config";

// Limite dei tentativi di checkout (passo 7.2). Fail closed: senza chiave segreta, o con un errore del
// contatore, il checkout è negato (codice rate_limited nell'esito di startCheckout).

export async function checkoutAllowed(userId: string | null): Promise<boolean> {
  const secret = rateLimitSecret();
  if (!secret) return false;
  const requestHeaders = await headers();
  const checks = checkoutLimitChecks({ userId, ip: clientIp(requestHeaders), secret });
  try {
    const results = await Promise.all(
      checks.map((check) =>
        dbPublic((tx) =>
          tx.execute<{ allowed: boolean }>(
            sql`select public.hit_rate_limit(${check.bucket}, ${check.limit}, ${check.windowSeconds}) as allowed`,
          ),
        ).then((rows) => rows[0]?.allowed === true),
      ),
    );
    return results.every(Boolean);
  } catch {
    return false;
  }
}
