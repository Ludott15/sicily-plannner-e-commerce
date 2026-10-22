import "server-only";
import { createHmac } from "node:crypto";
import { rateLimitSecret } from "@/server/affiliates/config";
import { clientIp } from "@/server/affiliates/rate-key";
import { hitRateLimit } from "@/server/db/rate-limiter";
import type { DbUser } from "@/server/db/user";
import { CHAT_DAY_SECONDS, CHAT_IP_LIMIT, dailyLimitFor } from "./config";

// Limiti del chatbot (passo 9.1): per utente al giorno (40, ospiti 10) e per IP all'ora (120). Il
// contatore è public.hit_rate_limit, a finestra fissa. Il bucket è un HMAC con prefisso chat:,
// così non compaiono IP né id in chiaro e non si confonde con i bucket di /api/go.
// Il limite è FAIL CLOSED: se il contatore non risponde, la richiesta è rifiutata (rate_limited).
// Senza una chiave di bucket (RATE_LIMIT_SECRET o AFFILIATE_LINK_SECRET) nessuna chat parte.

export type HitCounter = (bucket: string, limit: number, windowSeconds: number) => Promise<boolean>;

export type RateDecision = { allowed: true } | { allowed: false; resetAt: string };

// Prossimo inizio di finestra fissa (la stessa aritmetica di hit_rate_limit).
export function nextWindowStart(windowSeconds: number, now: Date): Date {
  const seconds = Math.floor(now.getTime() / 1000);
  const next = (Math.floor(seconds / windowSeconds) + 1) * windowSeconds;
  return new Date(next * 1000);
}

export function chatBucket(scope: "user" | "ip", identity: string, secret: string): string {
  return createHmac("sha256", secret).update(`chat:${scope}:${identity}`).digest("base64url");
}

// Esito dei due contatori. Un errore del contatore (eccezione) vale come limite raggiunto.
export async function decideChatLimit(input: {
  user: DbUser;
  ip: string | null;
  secret: string;
  counter: HitCounter;
  now: Date;
}): Promise<RateDecision> {
  const userResetAt = nextWindowStart(CHAT_DAY_SECONDS, input.now).toISOString();
  const ipResetAt = nextWindowStart(CHAT_IP_LIMIT.windowSeconds, input.now).toISOString();
  try {
    const userAllowed = await input.counter(
      chatBucket("user", input.user.id, input.secret),
      dailyLimitFor(input.user.is_anonymous === true),
      CHAT_DAY_SECONDS,
    );
    if (!userAllowed) return { allowed: false, resetAt: userResetAt };
    const ipAllowed = await input.counter(
      chatBucket("ip", input.ip ?? "unknown", input.secret),
      CHAT_IP_LIMIT.limit,
      CHAT_IP_LIMIT.windowSeconds,
    );
    return ipAllowed ? { allowed: true } : { allowed: false, resetAt: ipResetAt };
  } catch {
    return { allowed: false, resetAt: userResetAt };
  }
}

const databaseCounter: HitCounter = (bucket, limit, windowSeconds) => hitRateLimit(bucket, limit, windowSeconds);

export async function checkChatRateLimit(user: DbUser, headers: Headers): Promise<RateDecision> {
  const secret = rateLimitSecret();
  if (!secret) return { allowed: false, resetAt: nextWindowStart(CHAT_DAY_SECONDS, new Date()).toISOString() };
  return decideChatLimit({
    user,
    ip: clientIp(headers),
    secret,
    counter: databaseCounter,
    now: new Date(),
  });
}
