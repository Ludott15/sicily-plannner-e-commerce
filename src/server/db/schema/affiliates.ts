import { sql } from "drizzle-orm";
import { check, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { activities } from "./catalog";
import { partner } from "./enums";
import { profiles } from "./profiles";
import { itineraries } from "./trips";

// Ogni click in uscita passa da /api/go e lascia una riga con subid univoco.
export const affiliateClicks = pgTable(
  "affiliate_clicks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    activityId: uuid("activity_id").references(() => activities.id, { onDelete: "set null" }),
    partner: partner("partner").notNull(),
    targetUrl: text("target_url").notNull(),
    subid: text("subid").notNull().unique(),
    context: text("context").notNull(),
    itineraryId: uuid("itinerary_id").references(() => itineraries.id, { onDelete: "set null" }),
    anonId: text("anon_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("affiliate_clicks_created_at_idx").on(t.createdAt),
    check(
      "affiliate_clicks_context_valid",
      sql`${t.context} in ('page', 'itinerary', 'chat', 'flights')`,
    ),
    check("affiliate_clicks_target_url_https", sql`${t.targetUrl} ~ '^https://'`),
  ],
);

// Importate dai report dei partner; collegate ai click tramite subid.
export const affiliateConversions = pgTable(
  "affiliate_conversions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partner: partner("partner").notNull(),
    subid: text("subid").notNull(),
    amountEur: numeric("amount_eur", { precision: 10, scale: 2 }),
    commissionEur: numeric("commission_eur", { precision: 10, scale: 2 }),
    status: text("status").notNull(),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("affiliate_conversions_subid_idx").on(t.subid)],
);
