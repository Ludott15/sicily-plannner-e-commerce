import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

// Notifiche in-app: esito delle proposte di aggiunta (passo 4.2) e badge ottenuti (passo 5.2). Le
// scrivono solo le funzioni SQL SECURITY DEFINER; l'utente legge le proprie e segna come lette (read_at).
// Il check di kind è esteso in supabase/migrations/20261015181328_badge.sql (drop e add di notifications_kind_valid).
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, string | number | null>>().notNull().default(sql`'{}'::jsonb`),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_read_idx").on(t.userId, t.readAt),
    check(
      "notifications_kind_valid",
      sql`${t.kind} in ('proposal_accepted','proposal_rejected','badge_earned')`,
    ),
  ],
);
