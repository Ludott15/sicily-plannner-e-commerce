import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { activities, places } from "./catalog";
import { pointReason } from "./enums";
import { profiles } from "./profiles";
import { itineraries } from "./trips";

// Registro immutabile: si scrive solo con award_points, niente update o delete.
// ref_id è obbligatorio così unique(user_id, reason, ref_id) rende ogni azione idempotente
// (per azioni una tantum, come profile_completed, ref_id = id dell'utente).
export const pointsLedger = pgTable(
  "points_ledger",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: pointReason("reason").notNull(),
    refType: text("ref_type").notNull(),
    refId: uuid("ref_id").notNull(),
    season: text("season").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("points_ledger_user_reason_ref_unique").on(t.userId, t.reason, t.refId),
    index("points_ledger_season_user_idx").on(t.season, t.userId),
    check("points_ledger_delta_non_zero", sql`${t.delta} <> 0`),
    check("points_ledger_season_format", sql`${t.season} ~ '^[0-9]{4}-(estate|inverno)$'`),
  ],
);

export const badges = pgTable("badges", {
  key: text("key").primaryKey(),
  nameIt: text("name_it").notNull(),
  nameEn: text("name_en").notNull(),
  description: text("description"),
  criteria: jsonb("criteria").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userBadges = pgTable(
  "user_badges",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    badgeKey: text("badge_key")
      .notNull()
      .references(() => badges.key, { onDelete: "restrict", onUpdate: "cascade" }),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.badgeKey] })],
);

// Un check-in per luogo al giorno (ora italiana); distanza e limite giornaliero
// li verifica la funzione server che registra il check-in.
export const checkIns = pgTable(
  "check_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "restrict" }),
    itineraryId: uuid("itinerary_id").references(() => itineraries.id, { onDelete: "set null" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    localDate: date("local_date")
      .notNull()
      .default(sql`(now() at time zone 'Europe/Rome')::date`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("check_ins_user_place_day_unique").on(t.userId, t.placeId, t.localDate),
    index("check_ins_user_date_idx").on(t.userId, t.localDate),
    check("check_ins_lat_range", sql`${t.lat} between -90 and 90`),
    check("check_ins_lng_range", sql`${t.lng} between -180 and 180`),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    rating: smallint("rating").notNull(),
    body: text("body"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("reviews_user_activity_unique").on(t.userId, t.activityId),
    index("reviews_activity_id_idx").on(t.activityId),
    check("reviews_rating_range", sql`${t.rating} between 1 and 5`),
    check("reviews_body_length", sql`char_length(${t.body}) <= 4000`),
  ],
);
