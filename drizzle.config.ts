import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

// Le migrazioni finiscono in supabase/migrations con prefisso timestamp,
// così la CLI di Supabase le applica (db reset, db push) senza passaggi extra.
// Policy RLS, funzioni e trigger si scrivono a mano in migrazioni custom:
// `npm run db:generate -- --custom --name=<nome>`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./supabase/migrations",
  migrations: { prefix: "supabase" },
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
