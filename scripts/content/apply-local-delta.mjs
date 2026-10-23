// Applica scripts/content/local-delta.sql al database locale: porta le righe demo esistenti allo stato
// del seed nuovo senza db:reset. Idempotente. Rifiuta ogni host che non sia locale.
//
//   node scripts/content/apply-local-delta.mjs                              (local-delta.sql, prima dell import)
//   node scripts/content/apply-local-delta.mjs scripts/content/local-fix.sql  (correzioni dopo l import)
//
// Connessione: DATABASE_URL da .env.local. Eseguire dopo la migrazione (supabase migration up --local).

import { config } from "dotenv";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isLocalDatabase } from "./import-guides.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function main() {
  config({ path: join(ROOT, ".env.local"), quiet: true });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL mancante (.env.local o ambiente)");
  if (!isLocalDatabase(url)) throw new Error("il delta locale si applica solo a un database locale");
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    const file = process.argv[2] ?? join("scripts", "content", "local-delta.sql");
    await sql.unsafe(readFileSync(join(ROOT, file), "utf8"));
    console.log(`applicato ${file}`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
