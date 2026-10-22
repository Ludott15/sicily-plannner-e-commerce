import "server-only";
import { createHmac } from "node:crypto";
import { rateLimitSecret } from "@/server/affiliates/config";
import { clientIp } from "@/server/affiliates/rate-key";
import { hitRateLimit } from "@/server/db/rate-limiter";

// Limiti della ricerca (passo 11.2) per IP, con la funzione SQL hit_rate_limit. Il bucket ha un
// prefisso proprio ("search:"): non condivide il contatore con /api/go ("go:"). Senza
// RATE_LIMIT_SECRET né AFFILIATE_LINK_SECRET il limite non si applica, come per /api/go. Un guasto
// del contatore non blocca la ricerca (fail open).

export type SearchRateRule = { name: "suggest" | "miss"; limit: number; windowSeconds: number };

// Suggerimenti dell'header: 120 richieste al minuto.
export const SUGGEST_RATE_RULE = { name: "suggest", limit: 120, windowSeconds: 60 } as const satisfies SearchRateRule;
// Registrazione delle ricerche senza risultati: 60 all'ora.
export const MISS_RATE_RULE = { name: "miss", limit: 60, windowSeconds: 3600 } as const satisfies SearchRateRule;

// 43 caratteri base64url: rispetta il formato di hit_rate_limit ([A-Za-z0-9_-]{16,128}).
export function searchRateBucket(rule: SearchRateRule, ip: string, secret: string): string {
  return createHmac("sha256", secret).update(`search:${rule.name}:${ip}`).digest("base64url");
}

// true se la richiesta è consentita. Errori del contatore: consentito.
export async function allowSearchRequest(headers: Headers, rule: SearchRateRule): Promise<boolean> {
  const secret = rateLimitSecret();
  if (!secret) return true;
  const bucket = searchRateBucket(rule, clientIp(headers) ?? "unknown", secret);
  try {
    return await hitRateLimit(bucket, rule.limit, rule.windowSeconds);
  } catch {
    return true;
  }
}
