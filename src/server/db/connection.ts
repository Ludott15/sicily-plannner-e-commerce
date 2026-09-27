import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Connessione unica come ruolo `postgres`. Non importare fuori da src/server/db:
// il codice applicativo usa dbAsUser (RLS applicata) o dbAdmin (percorsi riservati).
const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

// Il pooler Supabase in modalità transaction (porta 6543) non supporta i prepared
// statement: disattivati di default, riattivabili solo con connessione diretta o session mode.
const prepare = process.env.DATABASE_PREPARED_STATEMENTS === "true";

const client = globalForDb.pg ?? postgres(process.env.DATABASE_URL!, { prepare, max: 5 });
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const connection = drizzle(client, { schema, casing: "snake_case" });

export function closeConnection() {
  globalForDb.pg = undefined;
  return client.end();
}
