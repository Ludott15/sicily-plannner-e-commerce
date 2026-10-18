import { sql } from "drizzle-orm";
import { bigserial, boolean, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

// Registro dei consensi (passo 8.2). Immutabile come il ledger: una riga a ogni scelta, e lo stato
// attuale è l'ultima riga per (user_id, kind). Scrittura solo con public.record_consent (SQL
// custom: supabase/custom-gdpr.sql); il proprietario legge le sue righe per RLS. Le versioni dei testi
// stanno in src/lib/consents.ts. Immutabilità e grant sono nel SQL custom.
export const userConsents = pgTable(
  "user_consents",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    granted: boolean("granted").notNull(),
    textVersion: text("text_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("user_consents_user_kind_idx").on(t.userId, t.kind, t.id),
    check(
      "user_consents_kind_valid",
      sql`${t.kind} in ('profiling', 'location', 'sensitive', 'newsletter', 'cookies_analytics')`,
    ),
    check("user_consents_text_version_length", sql`char_length(${t.textVersion}) between 1 and 40`),
  ],
);

export type UserConsent = typeof userConsents.$inferSelect;
