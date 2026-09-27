import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

// Registro immutabile delle azioni admin su punti, ordini e stato delle attività.
// actor_id diventa null se l'account dell'admin viene eliminato: la riga resta.
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    diff: jsonb("diff"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("admin_audit_log_created_at_idx").on(t.createdAt),
    index("admin_audit_log_entity_idx").on(t.entity, t.entityId),
  ],
);
