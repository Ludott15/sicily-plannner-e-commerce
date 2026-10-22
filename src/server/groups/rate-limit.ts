import "server-only";
import { createHmac } from "node:crypto";
import { rateLimitSecret } from "@/server/affiliates/config";
import { hitRateLimit } from "@/server/db/rate-limiter";
import { EMAIL_INVITE_DAILY_LIMIT } from "./state";

// Limite delle email di invito per utente al giorno (passo 4.1), con hit_rate_limit. Il bucket è
// un HMAC dell'id utente con la chiave del rate limit: nel database non compare l'id in chiaro.
// Il prefisso "group-email-invite" lo tiene separato dai bucket dei click (go:).

const DAY_SECONDS = 86_400;

export function emailInviteBucket(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`group-email-invite:${userId}`).digest("base64url");
}

// true se l'utente può inviare ancora un'email di invito nella giornata. Senza chiave del rate
// limit non si invia nulla (il chiamante risponde email_unavailable prima di arrivare qui).
export async function allowEmailInvite(userId: string): Promise<boolean> {
  const secret = rateLimitSecret();
  if (!secret) return false;
  const bucket = emailInviteBucket(userId, secret);
  return hitRateLimit(bucket, EMAIL_INVITE_DAILY_LIMIT, DAY_SECONDS);
}

export function inviteEmailLimitConfigured(): boolean {
  return rateLimitSecret() !== undefined;
}
