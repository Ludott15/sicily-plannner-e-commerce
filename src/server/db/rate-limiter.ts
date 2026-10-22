import "server-only";
import { sql } from "drizzle-orm";
import { connection } from "./connection";
import type { UserTx } from "./user";

// Contatore dei limiti di frequenza (passo 11.5). hit_rate_limit gira come ruolo rate_limiter, che né
// anon né authenticated possono usare (migrazione rate_limiter_role): così nessun client può consumare o
// azzerare un contatore. Stessa forma di dbPublic (src/server/db/public.ts): ruolo e transazione locali.
export function dbRateLimiter<T>(fn: (tx: UserTx) => Promise<T>): Promise<T> {
  return connection.transaction(async (tx) => {
    await tx.execute(sql`set local role rate_limiter`);
    return fn(tx);
  });
}

// true se la richiesta rientra nel limite, false se lo ha superato. Lancia se il contatore non risponde
// o i parametri non sono validi (la funzione SQL alza invalid_rate_limit): ogni chiamante decide il ripiego.
export async function hitRateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const [row] = await dbRateLimiter((tx) =>
    tx.execute<{ allowed: boolean | null }>(
      sql`select public.hit_rate_limit(${bucket}, ${limit}, ${windowSeconds}) as allowed`,
    ),
  );
  if (row?.allowed !== true && row?.allowed !== false) throw new Error("rate_counter_invalid");
  return row.allowed;
}
