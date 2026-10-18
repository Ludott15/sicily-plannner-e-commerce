import { sql } from "drizzle-orm";
import { check, pgTable, primaryKey, smallint, timestamp, uuid } from "drizzle-orm/pg-core";
import { areas } from "./catalog";

// Tempi di guida tra due aree (M4 parte 4): una riga per coppia, con area_a_id < area_b_id
// (la coppia non è ordinata: una sola riga). Coppia assente = non componibile. Scritta solo
// dall'admin con dbAdmin (src/server/catalog/drive-times.admin.ts); letta dal motore con dbPublic.
export const areaDriveTimes = pgTable(
  "area_drive_times",
  {
    areaAId: uuid("area_a_id")
      .notNull()
      .references(() => areas.id, { onDelete: "cascade" }),
    areaBId: uuid("area_b_id")
      .notNull()
      .references(() => areas.id, { onDelete: "cascade" }),
    minutes: smallint("minutes").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.areaAId, t.areaBId] }),
    check("area_drive_times_order", sql`${t.areaAId} < ${t.areaBId}`),
    check("area_drive_times_minutes", sql`${t.minutes} between 1 and 600`),
  ],
);
