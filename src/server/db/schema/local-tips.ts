import { sql } from "drizzle-orm";
import { boolean, check, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { activities, places } from "./catalog";
import { localTipAuthorKind } from "./enums";
import { profiles } from "./profiles";

// Consigli locali (schema 2e, docs/design/components/LocalTip/README.md): firmati dalla
// redazione o da una persona reale che ha dato il consenso, con data di verifica. Pubblici
// solo tramite la vista public_local_tips (attivi e verificati negli ultimi 12 mesi).

export const localTipAuthors = pgTable(
  "local_tip_authors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: localTipAuthorKind("kind").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio"),
    photoUrl: text("photo_url"),
    profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "set null" }),
    // Una persona firma solo con il suo consenso esplicito (data).
    consentAt: timestamp("consent_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("local_tip_authors_person_consent", sql`${t.kind} <> 'person' or ${t.consentAt} is not null`),
    check("local_tip_authors_photo_https", sql`${t.photoUrl} ~ '^https://'`),
  ],
);

export const localTips = pgTable(
  "local_tips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => localTipAuthors.id, { onDelete: "restrict" }),
    activityId: uuid("activity_id").references(() => activities.id, { onDelete: "cascade" }),
    placeId: uuid("place_id").references(() => places.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    // Relazione dell'autore con il luogo ("ci va ogni estate da 15 anni"): obbligatoria per
    // le persone (trigger local_tips_person_relation).
    authorRelation: text("author_relation"),
    verifiedAt: date("verified_at").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("local_tips_activity_id_idx").on(t.activityId),
    index("local_tips_place_id_idx").on(t.placeId),
    index("local_tips_verified_at_idx").on(t.verifiedAt),
    check("local_tips_target", sql`${t.activityId} is not null or ${t.placeId} is not null`),
    check("local_tips_body_length", sql`char_length(${t.body}) between 1 and 280`),
  ],
);
