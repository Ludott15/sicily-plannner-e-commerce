import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { activities, interests } from "./catalog";
import { eventType } from "./enums";
import { profiles } from "./profiles";
import { itineraries } from "./trips";

// Vincoli rigidi: filtrano le attività prima dello scoring.
export const userConstraints = pgTable(
  "user_constraints",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    budgetPerDayEur: integer("budget_per_day_eur"),
    hasCar: boolean("has_car").notNull().default(false),
    reducedMobility: boolean("reduced_mobility").notNull().default(false),
    diet: text("diet").array().notNull().default(sql`'{}'`),
    maxDailyTravelMin: integer("max_daily_travel_min"),
    heatTolerance: smallint("heat_tolerance"),
    crowdTolerance: smallint("crowd_tolerance"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("user_constraints_budget_non_negative", sql`${t.budgetPerDayEur} >= 0`),
    check("user_constraints_travel_positive", sql`${t.maxDailyTravelMin} > 0`),
    check("user_constraints_heat_range", sql`${t.heatTolerance} between 0 and 5`),
    check("user_constraints_crowd_range", sql`${t.crowdTolerance} between 0 and 5`),
  ],
);

// explicit lo sceglie l'utente; implicit lo aggiorna solo il cron notturno.
export const preferenceWeights = pgTable(
  "preference_weights",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    interestKey: text("interest_key")
      .notNull()
      .references(() => interests.key, { onDelete: "cascade", onUpdate: "cascade" }),
    explicit: smallint("explicit").notNull().default(0),
    implicit: real("implicit").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.interestKey] }),
    check("preference_weights_explicit_range", sql`${t.explicit} between 0 and 5`),
    check("preference_weights_implicit_range", sql`${t.implicit} between -2 and 2`),
  ],
);

export const userTaste = pgTable(
  "user_taste",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    embedding: vector("embedding", { dimensions: 1024 }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("user_taste_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops"))],
);

export const userEvents = pgTable(
  "user_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    type: eventType("type").notNull(),
    activityId: uuid("activity_id").references(() => activities.id, { onDelete: "cascade" }),
    itineraryId: uuid("itinerary_id").references(() => itineraries.id, { onDelete: "set null" }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("user_events_unprocessed_idx")
      .on(t.userId)
      .where(sql`${t.processedAt} is null`),
  ],
);
