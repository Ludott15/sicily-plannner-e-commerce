import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Ricerche senza risultati (passo 11.2): una riga per frase normalizzata, con quante volte è stata
// cercata. Niente utente, niente IP, niente timestamp per richiesta. Solo l'admin legge la tabella
// (RLS in supabase/migrations/20261016172029_search_fts.sql); la scrittura passa da public.record_search_miss.
// La funzione di ricerca public.search_site non sta qui: è SQL custom (supabase/migrations/20261016172029_search_fts.sql).
export const searchMisses = pgTable(
  "search_misses",
  {
    queryNorm: text("query_norm").primaryKey(),
    misses: integer("misses").notNull().default(1),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("search_misses_query_norm_length", sql`char_length(${t.queryNorm}) between 2 and 100`),
    check("search_misses_misses_positive", sql`${t.misses} > 0`),
  ],
);
