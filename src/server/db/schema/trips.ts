import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { activities, places } from "./catalog";
import { groupRole, inviteStatus, itineraryStatus } from "./enums";
import { profiles } from "./profiles";

// Itinerari e gruppi stanno nello stesso file: si referenziano a vicenda
// (groups.itinerary_id e itineraries.group_id).

// owner_id null = itinerario predefinito editoriale, che è sempre un template pubblico.
export const itineraries = pgTable(
  "itineraries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references((): AnyPgColumn => groups.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    slug: text("slug").unique(),
    isTemplate: boolean("is_template").notNull().default(false),
    templateId: uuid("template_id").references((): AnyPgColumn => itineraries.id, {
      onDelete: "set null",
    }),
    startDate: date("start_date"),
    days: smallint("days").notNull(),
    // Titolo editoriale di ogni giorno ("Noto e costa"), per indice. Un giorno senza titolo
    // mostra i luoghi delle sue tappe. Chi copia un itinerario pronto eredita i titoli.
    dayTitles: text("day_titles").array().notNull().default(sql`'{}'`),
    status: itineraryStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("itineraries_owner_id_idx").on(t.ownerId),
    index("itineraries_group_id_idx").on(t.groupId),
    check("itineraries_days_range", sql`${t.days} between 1 and 60`),
    check("itineraries_title_length", sql`char_length(btrim(${t.title})) between 1 and 200`),
    check("itineraries_template_iff_editorial", sql`(${t.ownerId} is null) = ${t.isTemplate}`),
    check("itineraries_day_titles_within_days", sql`cardinality(${t.dayTitles}) <= ${t.days}`),
  ],
);

export const itineraryItems = pgTable(
  "itinerary_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itineraryId: uuid("itinerary_id")
      .notNull()
      .references(() => itineraries.id, { onDelete: "cascade" }),
    dayIndex: smallint("day_index").notNull(),
    position: smallint("position").notNull(),
    activityId: uuid("activity_id").references(() => activities.id, { onDelete: "restrict" }),
    placeId: uuid("place_id").references(() => places.id, { onDelete: "restrict" }),
    customTitle: text("custom_title"),
    startTime: time("start_time"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("itinerary_items_itinerary_day_position_idx").on(t.itineraryId, t.dayIndex, t.position),
    check("itinerary_items_day_index_non_negative", sql`${t.dayIndex} >= 0`),
    check("itinerary_items_position_non_negative", sql`${t.position} >= 0`),
    check(
      "itinerary_items_has_subject",
      sql`${t.activityId} is not null or ${t.placeId} is not null or ${t.customTitle} is not null`,
    ),
  ],
);

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    itineraryId: uuid("itinerary_id").references((): AnyPgColumn => itineraries.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("groups_owner_id_idx").on(t.ownerId),
    check("groups_name_length", sql`char_length(btrim(${t.name})) between 1 and 80`),
  ],
);

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: groupRole("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    index("group_members_user_id_idx").on(t.userId),
  ],
);

// Il token in chiaro esiste solo nel link: qui c'è solo l'hash SHA-256 (hex).
export const groupInvites = pgTable(
  "group_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '7 days'`),
    maxUses: smallint("max_uses").notNull().default(10),
    uses: smallint("uses").notNull().default(0),
    status: inviteStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("group_invites_group_id_idx").on(t.groupId),
    check("group_invites_token_hash_format", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check("group_invites_max_uses_range", sql`${t.maxUses} between 1 and 10`),
    check("group_invites_uses_range", sql`${t.uses} between 0 and ${t.maxUses}`),
    check(
      "group_invites_expiry_max_7_days",
      sql`${t.expiresAt} <= ${t.createdAt} + interval '7 days'`,
    ),
  ],
);

export const itemVotes = pgTable(
  "item_votes",
  {
    itineraryItemId: uuid("itinerary_item_id")
      .notNull()
      .references(() => itineraryItems.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    value: smallint("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.itineraryItemId, t.userId] }),
    index("item_votes_user_id_idx").on(t.userId),
    check("item_votes_value_valid", sql`${t.value} in (-1, 1)`),
  ],
);
