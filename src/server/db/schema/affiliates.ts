import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { activities, activityOffers } from "./catalog";
import { partner } from "./enums";
import { profiles } from "./profiles";
import { itineraries } from "./trips";

// Configurazione dei partner (passo 3.1): una riga per partner, modificabile dall'admin.
// Template e host sono letti solo dal server (affiliate_partner_config o dbAdmin): il client
// legge solo partner, name, verticals e is_active (grant di colonna in post-tables.sql).
// Aggiungere un partner = un valore dell'enum partner + una riga qui (migrazione) + la variabile
// d'ambiente indicata in partner_id_env. Template e parametri: da confermare con i termini di
// ogni programma (docs/LANCIO.md).
export const affiliatePartners = pgTable(
  "affiliate_partners",
  {
    partner: partner("partner").primaryKey(),
    name: text("name").notNull(),
    verticals: text("verticals").array().notNull(),
    // Null per i partner che si collegano solo tramite offerte (o per link costruiti altrove).
    // Segnaposto: {query} {checkin} {checkout} {adults} {airport} {partner_id} {subid} {locale}.
    searchUrlTemplate: text("search_url_template"),
    // Host esatti ammessi come destinazione (minuscolo, senza porta).
    allowedHosts: text("allowed_hosts").array().notNull().default(sql`'{}'`),
    // Nome del parametro in cui va il subid; null se il partner non ne usa uno.
    subidParam: text("subid_param"),
    // Nome della variabile d'ambiente con l'ID del partner (mai il valore).
    partnerIdEnv: text("partner_id_env"),
    isActive: boolean("is_active").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("affiliate_partners_partner_not_internal", sql`${t.partner} <> 'internal'`),
    check(
      "affiliate_partners_verticals_valid",
      sql`cardinality(${t.verticals}) > 0 and ${t.verticals} <@ array['activity','lodging','car','flight','ferry','train','transfer','tickets','boat','insurance','esim','luggage']::text[]`,
    ),
    check(
      "affiliate_partners_template_https",
      sql`${t.searchUrlTemplate} is null or ${t.searchUrlTemplate} ~ '^https://'`,
    ),
    check(
      "affiliate_partners_subid_param_format",
      sql`${t.subidParam} is null or ${t.subidParam} ~ '^[a-z][a-z0-9_]{0,19}$'`,
    ),
    check(
      "affiliate_partners_partner_id_env_format",
      sql`${t.partnerIdEnv} is null or ${t.partnerIdEnv} ~ '^[A-Z][A-Z0-9_]*$'`,
    ),
    check(
      "affiliate_partners_active_has_hosts",
      sql`not ${t.isActive} or cardinality(${t.allowedHosts}) > 0`,
    ),
  ],
);

// Contatore a finestra fissa per il rate limit dei click (/api/go). Il bucket è un HMAC calcolato
// dal server: nessuna lettura dal client (RLS attiva, nessun grant), solo hit_rate_limit.
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    bucket: text("bucket").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    hits: integer("hits").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.windowStart] })],
);

// Ogni click in uscita passa da /api/go e lascia una riga con subid univoco.
export const affiliateClicks = pgTable(
  "affiliate_clicks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    activityId: uuid("activity_id").references(() => activities.id, { onDelete: "set null" }),
    offerId: uuid("offer_id").references(() => activityOffers.id, { onDelete: "set null" }),
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

// Conversioni importate dai report dei partner (CSV dall'admin o API via cron); collegate ai click
// tramite subid. Idempotenza: (partner, external_id) è univoco e il re-import aggiorna la riga.
// external_id è l'id della conversione nel report del partner; se il report non lo ha, il server
// calcola un hash stabile (src/lib/affiliate-conversions/external-id.ts). Le righe si leggono solo
// dall'admin; scrittura solo con dbAdmin (nessun grant di scrittura al client).
export const affiliateConversions = pgTable(
  "affiliate_conversions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partner: partner("partner").notNull(),
    subid: text("subid").notNull(),
    externalId: text("external_id").notNull(),
    amountEur: numeric("amount_eur", { precision: 10, scale: 2 }),
    commissionEur: numeric("commission_eur", { precision: 10, scale: 2 }),
    currency: char("currency", { length: 3 }).notNull().default("EUR"),
    status: text("status").notNull(),
    source: text("source").notNull(),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("affiliate_conversions_subid_idx").on(t.subid),
    unique("affiliate_conversions_partner_external_id_key").on(t.partner, t.externalId),
    check(
      "affiliate_conversions_status_valid",
      sql`${t.status} in ('pending', 'approved', 'cancelled', 'paid')`,
    ),
    check("affiliate_conversions_source_valid", sql`${t.source} in ('csv', 'api')`),
    check(
      "affiliate_conversions_external_id_length",
      sql`char_length(${t.externalId}) between 1 and 120`,
    ),
  ],
);
