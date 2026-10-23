import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/server/db/admin";

// Cron orario (passo 7.2): chiude le sessioni di checkout 'open' senza sessione Stripe più vecchie di
// 15 minuti e restituisce i loro punti, una volta sola (checkout_sweep_stale). Usa il ruolo postgres:
// la funzione SQL non ha grant ai client.
export async function sweepStaleCheckouts(): Promise<number> {
  const rows = await dbAdmin.execute<{ closed: number }>(
    sql`select public.checkout_sweep_stale(interval '15 minutes') as closed`,
  );
  return Number(rows[0]?.closed ?? 0);
}
