import { createHmac } from "node:crypto";

// Limiti dei tentativi di checkout (passo 7.2), puri: nessun database. Il contatore è
// public.hit_rate_limit (src/server/shop/checkout-limit.ts). Ogni bucket è un HMAC con prefisso dello
// scopo, così nel database non compaiono né id né IP in chiaro.

export const CHECKOUT_USER_LIMIT = { limit: 10, windowSeconds: 24 * 60 * 60 } as const;
export const CHECKOUT_IP_LIMIT = { limit: 30, windowSeconds: 60 * 60 } as const;

export type CheckoutLimitCheck = { bucket: string; limit: number; windowSeconds: number };

export function checkoutBucket(scope: "user" | "ip", identity: string, secret: string): string {
  return createHmac("sha256", secret).update(`checkout:${scope}:${identity}`).digest("base64url");
}

// Controlli da fare per una richiesta di checkout: 10 al giorno per utente (ospiti compresi, perché
// hanno un id di sessione) e 30 all'ora per IP. Senza IP noto, il bucket è comune a tutti i non identificati.
export function checkoutLimitChecks(input: { userId: string | null; ip: string | null; secret: string }): CheckoutLimitCheck[] {
  const checks: CheckoutLimitCheck[] = [];
  if (input.userId) {
    checks.push({
      bucket: checkoutBucket("user", input.userId, input.secret),
      ...CHECKOUT_USER_LIMIT,
    });
  }
  checks.push({
    bucket: checkoutBucket("ip", input.ip ?? "unknown", input.secret),
    ...CHECKOUT_IP_LIMIT,
  });
  return checks;
}
