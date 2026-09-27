import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  doublePrecision,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { partner } from "./enums";

// Vocabolario condiviso da attività e profili: è il ponte dello scoring.
export const interests = pgTable("interests", {
  key: text("key").primaryKey(),
  labelIt: text("label_it").notNull(),
  labelEn: text("label_en").notNull(),
  sort: smallint("sort").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    province: char("province", { length: 2 }).notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    description: text("description"),
    coverImage: text("cover_image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("places_lat_range", sql`${t.lat} between -90 and 90`),
    check("places_lng_range", sql`${t.lng} between -180 and 180`),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    durationMin: integer("duration_min").notNull(),
    priceFromEur: numeric("price_from_eur", { precision: 8, scale: 2 }),
    requiresCar: boolean("requires_car").notNull().default(false),
    accessible: boolean("accessible").notNull().default(false),
    seasonMonths: smallint("season_months")
      .array()
      .notNull()
      .default(sql`'{1,2,3,4,5,6,7,8,9,10,11,12}'`),
    partner: partner("partner").notNull().default("internal"),
    partnerProductId: text("partner_product_id"),
    affiliateUrl: text("affiliate_url"),
    rating: numeric("rating", { precision: 2, scale: 1 }),
    embedding: vector("embedding", { dimensions: 1024 }),
    isActive: boolean("is_active").notNull().default(true),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("activities_partner_product_unique").on(t.partner, t.partnerProductId),
    index("activities_place_id_idx").on(t.placeId),
    index("activities_is_active_partner_idx").on(t.isActive, t.partner),
    index("activities_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    check("activities_duration_positive", sql`${t.durationMin} > 0`),
    check("activities_price_non_negative", sql`${t.priceFromEur} >= 0`),
    check("activities_rating_range", sql`${t.rating} between 0 and 5`),
    check(
      "activities_season_months_valid",
      sql`${t.seasonMonths} <@ '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[]`,
    ),
  ],
);

export const activityInterests = pgTable(
  "activity_interests",
  {
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    interestKey: text("interest_key")
      .notNull()
      .references(() => interests.key, { onDelete: "cascade", onUpdate: "cascade" }),
    strength: smallint("strength").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.activityId, t.interestKey] }),
    index("activity_interests_interest_key_idx").on(t.interestKey),
    check("activity_interests_strength_range", sql`${t.strength} between 1 and 3`),
  ],
);
