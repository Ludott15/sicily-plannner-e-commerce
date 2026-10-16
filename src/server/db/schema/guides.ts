import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { media } from "./media";

// Guide editoriali (passo 11.1): articoli scritti dall'admin in Markdown. Il pubblico legge solo
// le guide pubblicate (RLS in supabase/custom-seo.sql). Il testo inglese è facoltativo: senza, la
// pagina inglese mostra quello italiano e lo segnala.
export const guides = pgTable(
  "guides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    titleIt: text("title_it").notNull(),
    titleEn: text("title_en"),
    summaryIt: text("summary_it"),
    summaryEn: text("summary_en"),
    bodyIt: text("body_it").notNull(),
    bodyEn: text("body_en"),
    // Nessun default: l'autore lo scrive l'admin (firma visibile dell'articolo).
    authorName: text("author_name").notNull(),
    coverMediaId: uuid("cover_media_id").references(() => media.id, { onDelete: "set null" }),
    status: text("status").notNull().default("draft"),
    // Data di pubblicazione: obbligatoria quando la guida è pubblicata (check guides_published_at).
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("guides_cover_media_id_idx").on(t.coverMediaId),
    index("guides_published_at_idx").on(t.publishedAt).where(sql`${t.status} = 'published'`),
    check("guides_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("guides_status_valid", sql`${t.status} in ('draft', 'published')`),
    check("guides_published_at", sql`${t.status} = 'draft' or ${t.publishedAt} is not null`),
    check("guides_title_it_length", sql`char_length(btrim(${t.titleIt})) between 1 and 160`),
    check("guides_title_en_length", sql`char_length(${t.titleEn}) <= 160`),
    check("guides_summary_length", sql`char_length(${t.summaryIt}) <= 300 and char_length(${t.summaryEn}) <= 300`),
    check("guides_body_it_length", sql`char_length(btrim(${t.bodyIt})) between 1 and 60000`),
    check("guides_body_en_length", sql`char_length(${t.bodyEn}) <= 60000`),
    check("guides_author_name_length", sql`char_length(btrim(${t.authorName})) between 2 and 120`),
  ],
);

// Collegamenti di una guida ai luoghi, alle attività, agli itinerari pronti e ai prodotti.
// Nessuna foreign key sul bersaglio (è polimorfica): la lettura unisce solo i bersagli pubblici
// esistenti, e l'admin scrive solo bersagli pubblici (src/server/editorial/admin-actions.admin.ts).
export const guideLinks = pgTable(
  "guide_links",
  {
    guideId: uuid("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    targetId: uuid("target_id").notNull(),
    position: smallint("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.guideId, t.kind, t.targetId] }),
    index("guide_links_target_idx").on(t.kind, t.targetId),
    check("guide_links_kind_valid", sql`${t.kind} in ('place', 'activity', 'itinerary', 'product')`),
    check("guide_links_position_range", sql`${t.position} between 0 and 99`),
  ],
);
