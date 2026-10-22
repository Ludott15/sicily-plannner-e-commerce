import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { hitRateLimit } from "@/server/db/rate-limiter";
import type { DbUser } from "@/server/db/user";
import { GO_RATE_LIMIT, rateLimitSecret } from "./config";
import { clientIp, rateLimitBucket } from "./rate-key";

// Limite dei click su /api/go (passo 3.1): per IP e per utente, 60 al minuto, con la funzione
// SQL hit_rate_limit (SECURITY DEFINER, nessun grant diretto sulla tabella). Senza
// RATE_LIMIT_SECRET né AFFILIATE_LINK_SECRET il limite non si applica: configurazione da
// completare (.env.example). Un guasto del contatore non blocca l'uscita verso il partner.

async function hitBucket(bucket: string): Promise<boolean> {
  return hitRateLimit(bucket, GO_RATE_LIMIT.limit, GO_RATE_LIMIT.windowSeconds);
}

// true se il click è consentito. Con utente si contano anche i suoi click.
export async function allowGoClick(request: NextRequest, user: DbUser | null): Promise<boolean> {
  const secret = rateLimitSecret();
  if (!secret) return true;
  const buckets = [rateLimitBucket("ip", clientIp(request.headers) ?? "unknown", secret)];
  if (user) buckets.push(rateLimitBucket("user", user.id, secret));
  try {
    const results = await Promise.all(buckets.map((bucket) => hitBucket(bucket)));
    return results.every((allowed) => allowed);
  } catch {
    return true;
  }
}

// Click oltre il limite: 303 alla pagina di ripiego con ?avviso=troppi-click (la pagina mostra
// Verticals.rateLimited), non un 429 JSON. Il click non si registra. Retry-After dice quando riprovare.
export function goRateLimitedResponse(origin: string, fallbackPath: string): NextResponse {
  const response = NextResponse.redirect(new URL(`${fallbackPath}?avviso=troppi-click`, origin), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Retry-After", String(GO_RATE_LIMIT.windowSeconds));
  return response;
}
