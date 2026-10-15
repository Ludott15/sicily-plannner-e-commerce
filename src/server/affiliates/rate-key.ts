import "server-only";
import { createHmac } from "node:crypto";

// Chiavi (bucket) del rate limit dei click (passo 3.1), pure e testabili. Il bucket è un HMAC di
// "go:<ip|user>:<identità>" con la chiave RATE_LIMIT_SECRET: nel database non compaiono IP né
// identificativi in chiaro, e dal client non si possono indovinare i bucket altrui.

// Primo IP di x-forwarded-for (lo imposta Vercel), poi x-real-ip. Null se assenti.
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const real = headers.get("x-real-ip")?.trim();
  return real ? real : null;
}

// 43 caratteri base64url: rispetta il formato di hit_rate_limit ([A-Za-z0-9_-]{16,128}).
export function rateLimitBucket(scope: "ip" | "user", identity: string, secret: string): string {
  return createHmac("sha256", secret).update(`go:${scope}:${identity}`).digest("base64url");
}
