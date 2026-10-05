import "server-only";
import { sql } from "drizzle-orm";
import type { User } from "@supabase/supabase-js";
import { connection } from "./connection";

export type UserTx = Parameters<Parameters<typeof connection.transaction>[0]>[0];

// L'utente deve arrivare da getUser/requireUser (token verificato), mai da input del client.
export type DbUser = Pick<User, "id"> & Partial<Pick<User, "email" | "is_anonymous">>;

// Esegue fn in una transazione con il ruolo `authenticated` e i claim dell'utente:
// auth.uid() restituisce user.id e la RLS si applica come per il client Supabase, compreso
// is_anonymous, su cui si basano le restrizioni degli ospiti.
// Ruolo e claim sono `local`, quindi spariscono al commit o al rollback.
export function dbAsUser<T>(user: DbUser, fn: (tx: UserTx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({
    sub: user.id,
    role: "authenticated",
    email: user.email,
    is_anonymous: user.is_anonymous ?? false,
  });

  return connection.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}
