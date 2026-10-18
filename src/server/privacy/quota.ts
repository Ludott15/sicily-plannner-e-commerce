import "server-only";
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { rateLimitSecret } from "@/server/affiliates/config";
import { dbPublic } from "@/server/db/public";
import type { DbUser } from "@/server/db/user";

// Quota per utente di un'operazione sensibile (export, eliminazione dei dati dell'ospite), a finestra
// fissa in public.hit_rate_limit. Il bucket è un HMAC con prefisso dello scopo: nessun id in chiaro.
// Fail closed: senza chiave segreta o con un errore del contatore, l'operazione è negata.
export async function userQuotaAllowed(
  user: DbUser,
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const secret = rateLimitSecret();
  if (!secret) return false;
  const bucket = createHmac("sha256", secret).update(`${scope}:user:${user.id}`).digest("base64url");
  try {
    const [row] = await dbPublic((tx) =>
      tx.execute<{ allowed: boolean }>(
        sql`select public.hit_rate_limit(${bucket}, ${limit}, ${windowSeconds}) as allowed`,
      ),
    );
    return row?.allowed === true;
  } catch {
    return false;
  }
}
