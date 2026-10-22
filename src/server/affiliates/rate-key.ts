import "server-only";
import { createHmac } from "node:crypto";

// Chiavi (bucket) del rate limit dei click (passo 3.1), pure e testabili. Il bucket è un HMAC di
// "go:<ip|user>:<identità>" con la chiave RATE_LIMIT_SECRET: nel database non compaiono IP né
// identificativi in chiaro, e dal client non si possono indovinare i bucket altrui.

// IP del visitatore. Su Vercel x-real-ip e x-forwarded-for hanno lo stesso valore, l'IP pubblico del client,
// impostato dalla piattaforma (https://vercel.com/docs/headers/request-headers): preferiamo x-real-ip, poi il
// primo IP di x-forwarded-for. Il modello di fiducia assume Vercel come edge: con un proxy davanti a Vercel
// x-forwarded-for può essere sovrascritto (documentazione Vercel), quindi il limite per IP va letto con cautela.
export function clientIp(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded ? forwarded : null;
}

// 43 caratteri base64url: rispetta il formato di hit_rate_limit ([A-Za-z0-9_-]{16,128}).
export function rateLimitBucket(scope: "ip" | "user", identity: string, secret: string): string {
  return createHmac("sha256", secret).update(`go:${scope}:${identity}`).digest("base64url");
}
