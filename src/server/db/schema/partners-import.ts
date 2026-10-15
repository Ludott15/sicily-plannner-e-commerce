import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { activities, interests } from "./catalog";
import { partner } from "./enums";

// Esecuzioni dell'import del catalogo partner (cron import-catalog e "Esegui ora" in admin).
// Solo admin in lettura; scrive il server con dbAdmin (nessun grant di scrittura al client).
export const partnerImportRuns = pgTable(
  "partner_import_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partner: partner("partner").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull(),
    createdCount: integer("created_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    deactivatedCount: integer("deactivated_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    error: text("error"),
  },
  (t) => [
    index("partner_import_runs_partner_started_at_idx").on(t.partner, t.startedAt),
    check("partner_import_runs_partner_not_internal", sql`${t.partner} <> 'internal'`),
    check("partner_import_runs_status_valid", sql`${t.status} in ('ok', 'failed')`),
    check(
      "partner_import_runs_counts_non_negative",
      sql`${t.createdCount} >= 0 and ${t.updatedCount} >= 0 and ${t.deactivatedCount} >= 0 and ${t.skippedCount} >= 0`,
    ),
    check(
      "partner_import_runs_finished_after_start",
      sql`${t.finishedAt} is null or ${t.finishedAt} >= ${t.startedAt}`,
    ),
    check("partner_import_runs_error_length", sql`char_length(${t.error}) <= 2000`),
  ],
);

// Tag proposti dall'AI per le attività nuove dell'import, in attesa di conferma dell'admin
// (coda "Da verificare"). Confermare copia le righe in activity_interests e cancella le proposte.
// Solo admin, scrittura con dbAdmin (nessun grant di scrittura al client).
export const activityTagProposals = pgTable(
  "activity_tag_proposals",
  {
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    interestKey: text("interest_key")
      .notNull()
      .references(() => interests.key, { onDelete: "cascade", onUpdate: "cascade" }),
    strength: smallint("strength").notNull(),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.activityId, t.interestKey] }),
    index("activity_tag_proposals_interest_key_idx").on(t.interestKey),
    check("activity_tag_proposals_strength_range", sql`${t.strength} between 1 and 3`),
    check("activity_tag_proposals_model_length", sql`char_length(${t.model}) <= 100`),
  ],
);
