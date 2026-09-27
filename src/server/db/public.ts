import "server-only";
import { sql } from "drizzle-orm";
import { connection } from "./connection";
import type { UserTx } from "./user";

// Letture pubbliche (pagine SEO, visitatori senza account): transazione con il ruolo
// `anon`, quindi si vede solo ciò che la RLS concede agli anonimi (attività attive,
// template, prodotti attivi). Ruolo e claim sono `local` e spariscono alla fine.
export function dbPublic<T>(fn: (tx: UserTx) => Promise<T>): Promise<T> {
  return connection.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await tx.execute(sql`set local role anon`);
    return fn(tx);
  });
}
