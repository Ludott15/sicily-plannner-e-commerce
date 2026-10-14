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
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { partner } from "./enums";
import { media } from "./media";

// Vocabolario condiviso da attività e profili: è il ponte dello scoring.
export const interests = pgTable("interests", {
  key: text("key").primaryKey(),
  labelIt: text("label_it").notNull(),
  labelEn: text("label_en").notNull(),
  sort: smallint("sort").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Aree di viaggio (M4 parte 3): l'unità con cui il motore compone i viaggi, non la provincia.
// Elenco editoriale (migrazione seed_areas), modificabile solo dall'admin.
export const areas = pgTable(
  "areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    nameIt: text("name_it").notNull(),
    nameEn: text("name_en").notNull(),
    sort: smallint("sort").notNull().default(0),
    // Copertina dell'area: un'illustrazione, ultimo anello della catena di ripiego delle immagini.
    coverMediaId: uuid("cover_media_id").references(() => media.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("areas_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`)],
);

export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    province: char("province", { length: 2 }).notNull(),
    // Area di viaggio; null = non ancora assegnata (le sue attività non entrano nelle proposte).
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "restrict" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    description: text("description"),
    // Una riga di presentazione, mostrata sotto il nome (massimo 90 caratteri).
    taglineIt: text("tagline_it"),
    // Un luogo inattivo non è visibile al pubblico: le attività attive non possono averne uno
    // (trigger activity_place_inactive). I luoghi esistenti restano attivi.
    isActive: boolean("is_active").notNull().default(true),
    // Coordinate o dati arrivati da un import, da verificare in admin.
    needsReview: boolean("needs_review").notNull().default(false),
    // Non più usata dalle pagine (sostituita da cover_media_id): resta finché non si verifica
    // che in produzione sia vuota, poi si elimina con una migrazione.
    coverImage: text("cover_image"),
    coverMediaId: uuid("cover_media_id").references(() => media.id, { onDelete: "set null" }),
    // Luogo in evidenza nel carosello della home, in ordine crescente.
    isFeatured: boolean("is_featured").notNull().default(false),
    featuredOrder: smallint("featured_order"),
    // Foto della hero della home: al massimo un luogo (indice unico parziale).
    isHomeHero: boolean("is_home_hero").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("places_area_id_idx").on(t.areaId),
    index("places_cover_media_id_idx").on(t.coverMediaId),
    uniqueIndex("places_single_home_hero").on(t.isHomeHero).where(sql`${t.isHomeHero}`),
    check("places_lat_range", sql`${t.lat} between -90 and 90`),
    check("places_lng_range", sql`${t.lng} between -180 and 180`),
    check("places_tagline_it_length", sql`char_length(${t.taglineIt}) <= 90`),
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
    // Nome in inglese: solo memorizzato, le pagine pubbliche non lo usano ancora.
    titleEn: text("title_en"),
    description: text("description"),
    durationMin: integer("duration_min").notNull(),
    // Prezzo pagato in loco (ingresso, biglietto): un metadato, mai un'offerta.
    onSitePriceEur: numeric("on_site_price_eur", { precision: 8, scale: 2 }),
    requiresCar: boolean("requires_car").notNull().default(false),
    accessible: boolean("accessible").notNull().default(false),
    seasonMonths: smallint("season_months")
      .array()
      .notNull()
      .default(sql`'{1,2,3,4,5,6,7,8,9,10,11,12}'`),
    rating: numeric("rating", { precision: 2, scale: 1 }),
    embedding: vector("embedding", { dimensions: 1024 }),
    // Diete per cui l'attività va bene (vegetariana, vegana, senza glutine, senza lattosio): per
    // le attività di cibo e vino è un vincolo rigido per chi ha indicato una dieta.
    dietFriendly: text("diet_friendly").array().notNull().default(sql`'{}'`),
    // Nasce inattiva: si attiva solo con almeno un tag di interesse (trigger activities_require_tags).
    isActive: boolean("is_active").notNull().default(false),
    // Creata o aggiornata da un import, da verificare in admin (coda "da verificare").
    needsReview: boolean("needs_review").notNull().default(false),
    coverMediaId: uuid("cover_media_id").references(() => media.id, { onDelete: "set null" }),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activities_place_id_idx").on(t.placeId),
    index("activities_cover_media_id_idx").on(t.coverMediaId),
    index("activities_needs_review_idx").on(t.needsReview).where(sql`${t.needsReview}`),
    index("activities_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    check("activities_duration_positive", sql`${t.durationMin} > 0`),
    check("activities_on_site_price_non_negative", sql`${t.onSitePriceEur} >= 0`),
    check("activities_rating_range", sql`${t.rating} between 0 and 5`),
    check("activities_diet_friendly_valid", sql`${t.dietFriendly} <@ '{vegetarian,vegan,gluten_free,lactose_free}'::text[]`),
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

// Offerte dei partner (schema 2e): il catalogo è editoriale, le offerte sono prodotti dei
// partner collegati a un'attività, ognuna con il suo prezzo. Più offerte per attività.
// Le crea l'admin e, dalla milestone 6, l'import del catalogo.
export const activityOffers = pgTable(
  "activity_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    partner: partner("partner").notNull(),
    partnerProductId: text("partner_product_id").notNull(),
    title: text("title").notNull(),
    priceFromEur: numeric("price_from_eur", { precision: 8, scale: 2 }),
    currency: char("currency", { length: 3 }).notNull().default("EUR"),
    affiliateUrl: text("affiliate_url").notNull(),
    rating: numeric("rating", { precision: 2, scale: 1 }),
    reviewsCount: integer("reviews_count"),
    freeCancellation: boolean("free_cancellation"),
    priceUpdatedAt: timestamp("price_updated_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("activity_offers_partner_product_unique").on(t.partner, t.partnerProductId),
    index("activity_offers_activity_id_idx").on(t.activityId),
    check("activity_offers_partner_not_internal", sql`${t.partner} <> 'internal'`),
    check("activity_offers_affiliate_url_https", sql`${t.affiliateUrl} ~ '^https://'`),
    check("activity_offers_price_non_negative", sql`${t.priceFromEur} >= 0`),
    check("activity_offers_currency_format", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check("activity_offers_rating_range", sql`${t.rating} between 0 and 5`),
    check("activity_offers_reviews_count_non_negative", sql`${t.reviewsCount} >= 0`),
  ],
);

// Fonte e note interne di un'attività (importate dal CSV o scritte in admin). Solo admin: non
// esce mai nelle pagine pubbliche (RLS in supabase/migrations, grant per colonna solo ad authenticated).
export const activitySources = pgTable(
  "activity_sources",
  {
    activityId: uuid("activity_id")
      .primaryKey()
      .references(() => activities.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url"),
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("activity_sources_source_url_format", sql`${t.sourceUrl} ~ '^https?://'`),
    check("activity_sources_source_url_length", sql`char_length(${t.sourceUrl}) <= 2000`),
    check("activity_sources_notes_length", sql`char_length(${t.notes}) <= 2000`),
  ],
);
