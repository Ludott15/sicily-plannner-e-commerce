import "server-only";
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { rateLimitSecret } from "@/server/affiliates/config";
import { dbPublic } from "@/server/db/public";

// Limite del modulo di contatto (passo 8.3): 5 messaggi l'ora per IP, con la stessa funzione SQL
// hit_rate_limit dei click affiliati. È fail closed: se il contatore non risponde o la chiave manca
// in produzione, il messaggio non parte. Il bucket è un HMAC: nel database non c'è l'IP in chiaro.
// Senza IP (intestazioni assenti) tutti questi invii condividono un solo bucket: limite più stretto.

export const CONTACT_RATE_LIMIT = { limit: 5, windowSeconds: 60 * 60 } as const;

// Chiave di sviluppo: solo fuori da produzione, quando nessuna chiave dei limiti è configurata.
const DEVELOPMENT_SECRET = "development-only-contact-rate-limit";

export type ContactRateCheck = "allowed" | "limited" | "unavailable";

function bucketSecret(): string | null {
  const secret = rateLimitSecret();
  if (secret) return secret;
  return process.env.VERCEL_ENV === "production" ? null : DEVELOPMENT_SECRET;
}

// Pura: la stessa coppia (ip, chiave) dà sempre lo stesso bucket.
export function contactBucket(ip: string | null, secret: string): string {
  return createHmac("sha256", secret)
    .update(`contact:ip:${ip ?? "unknown"}`)
    .digest("base64url");
}

export async function checkContactRateLimit(ip: string | null): Promise<ContactRateCheck> {
  const secret = bucketSecret();
  if (!secret) return "unavailable";
  try {
    const [row] = await dbPublic((tx) =>
      tx.execute<{ allowed: boolean | null }>(
        sql`select public.hit_rate_limit(${contactBucket(ip, secret)}, ${CONTACT_RATE_LIMIT.limit}, ${CONTACT_RATE_LIMIT.windowSeconds}) as allowed`,
      ),
    );
    if (row?.allowed === true) return "allowed";
    if (row?.allowed === false) return "limited";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}
