import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uuid,
  unique,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { activities, areas, places } from "./catalog";
import {
  bookingKind,
  bookingStatus,
  groupRole,
  inviteStatus,
  itineraryStatus,
  partner,
  timeSlot,
  travelParty,
  tripPace,
} from "./enums";
import { media } from "./media";
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
    // Quante persone viaggiano (M5): si chiede quando si crea il viaggio; null = non indicato.
    travelers: smallint("travelers"),
    // Titolo editoriale di ogni giorno ("Noto e costa"), per indice. Un giorno senza titolo
    // mostra i luoghi delle sue tappe. Chi copia un itinerario pronto eredita i titoli.
    dayTitles: text("day_titles").array().notNull().default(sql`'{}'`),
    // Nota personale di ogni giorno, per indice (come i titoli). Massimo 500 caratteri ciascuna.
    dayNotes: text("day_notes").array().notNull().default(sql`'{}'`),
    // Campi editoriali degli itinerari pronti (1.3). Il sottotitolo è una riga sotto il titolo,
    // la descrizione il testo di presentazione.
    subtitle: text("subtitle"),
    description: text("description"),
    // Mesi consigliati (1..12); vuoto = tutto l'anno.
    seasonMonths: smallint("season_months").array().notNull().default(sql`'{}'`),
    // Per chi è adatto l'itinerario (coppia, famiglia, amici, solo).
    suitableFor: travelParty("suitable_for").array().notNull().default(sql`'{}'`),
    // Ritmo del viaggio: obbligatorio per pubblicare un template (controlli di pubblicazione).
    pace: tripPace("pace"),
    // Introduzione di ogni giorno, per indice, come i titoli. Massimo 280 caratteri ciascuna.
    dayIntros: text("day_intros").array().notNull().default(sql`'{}'`),
    // Consigli generali dell'itinerario pronto (content/catalog), mostrati nella pagina come
    // "Consigli della redazione". Scritti dall'import dei contenuti, mai dal client.
    tips: text("tips").array().notNull().default(sql`'{}'`),
    status: itineraryStatus("status").notNull().default("draft"),
    // Copertina degli itinerari pronti; senza, quella del luogo della prima tappa.
    coverMediaId: uuid("cover_media_id").references(() => media.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("itineraries_owner_id_idx").on(t.ownerId),
    index("itineraries_cover_media_id_idx").on(t.coverMediaId),
    index("itineraries_group_id_idx").on(t.groupId),
    check("itineraries_days_range", sql`${t.days} between 1 and 60`),
    check("itineraries_title_length", sql`char_length(btrim(${t.title})) between 1 and 200`),
    check("itineraries_template_iff_editorial", sql`(${t.ownerId} is null) = ${t.isTemplate}`),
    check("itineraries_day_titles_within_days", sql`cardinality(${t.dayTitles}) <= ${t.days}`),
    check("itineraries_day_notes_within_days", sql`cardinality(${t.dayNotes}) <= ${t.days}`),
    check("itineraries_day_notes_length", sql`public.text_array_max_length(${t.dayNotes}) <= 500`),
    check("itineraries_travelers_range", sql`${t.travelers} between 1 and 30`),
    check("itineraries_subtitle_length", sql`char_length(${t.subtitle}) <= 140`),
    check("itineraries_description_length", sql`char_length(${t.description}) <= 2000`),
    check(
      "itineraries_season_months_range",
      sql`${t.seasonMonths} <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]`,
    ),
    check("itineraries_day_intros_within_days", sql`cardinality(${t.dayIntros}) <= ${t.days}`),
    check("itineraries_day_intros_length", sql`public.text_array_max_length(${t.dayIntros}) <= 280`),
    check("itineraries_tips_length", sql`public.text_array_max_length(${t.tips}) <= 260`),
    check("itineraries_tips_count", sql`cardinality(${t.tips}) <= 3`),
  ],
);

// Link pubblico in sola lettura (1.4). Il token in chiaro esiste solo al momento della creazione:
// qui c'è l'hash SHA-256 (hex). Un solo link attivo per itinerario (indice parziale).
// Il link revocato resta in tabella con revoked_at valorizzato.
export const itineraryShareLinks = pgTable(
  "itinerary_share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itineraryId: uuid("itinerary_id")
      .notNull()
      .references(() => itineraries.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("itinerary_share_links_one_active_idx")
      .on(t.itineraryId)
      .where(sql`${t.revokedAt} is null`),
    index("itinerary_share_links_created_by_idx").on(t.createdBy),
    check("itinerary_share_links_token_hash_format", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

// Checklist "Da prenotare" (schema 2e, con il builder M5). Una riga per cosa da prenotare:
// un'attività del viaggio, l'alloggio, l'auto, il volo. Lo stato lo segna l'utente.
// updated_by e updated_at li scrive un trigger, non il client.
export const itineraryBookings = pgTable(
  "itinerary_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itineraryId: uuid("itinerary_id")
      .notNull()
      .references(() => itineraries.id, { onDelete: "cascade" }),
    kind: bookingKind("kind").notNull(),
    activityId: uuid("activity_id").references(() => activities.id, { onDelete: "cascade" }),
    // Partner verso cui si prenota: arriva con i link della M6.
    partner: partner("partner"),
    status: bookingStatus("status").notNull().default("to_book"),
    updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("itinerary_bookings_item_unique").on(t.itineraryId, t.kind, t.activityId).nullsNotDistinct(),
    check("itinerary_bookings_activity_iff_kind", sql`(${t.kind} = 'activity') = (${t.activityId} is not null)`),
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
    // Ora di inizio: non più scritta dall'editor dei template (1.3), che usa timeSlot.
    startTime: time("start_time"),
    // Ora indicativa della tappa (mattina, pranzo, pomeriggio, sera).
    timeSlot: timeSlot("time_slot"),
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
    check("itinerary_items_notes_length", sql`char_length(${t.notes}) <= 280`),
  ],
);

// Dove dormire, per notte: la notte n sta tra il giorno n e il giorno n+1.
// Almeno uno tra area e luogo. Il collegamento agli alloggi arriva con la verticale alloggi (3.1).
export const itineraryNights = pgTable(
  "itinerary_nights",
  {
    itineraryId: uuid("itinerary_id")
      .notNull()
      .references(() => itineraries.id, { onDelete: "cascade" }),
    nightIndex: smallint("night_index").notNull(),
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "cascade" }),
    placeId: uuid("place_id").references(() => places.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.itineraryId, t.nightIndex] }),
    index("itinerary_nights_area_id_idx").on(t.areaId),
    index("itinerary_nights_place_id_idx").on(t.placeId),
    check("itinerary_nights_index_range", sql`${t.nightIndex} between 1 and 59`),
    check("itinerary_nights_area_or_place", sql`${t.areaId} is not null or ${t.placeId} is not null`),
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
    // Chi ha usato l'invito che ha portato dentro il membro (scritto da accept_invite). Null se
    // l'invito è stato eliminato con il suo autore.
    invitedBy: uuid("invited_by").references(() => profiles.id, { onDelete: "set null" }),
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

// Il voto è sulla tappa; itinerary_id (riempito da un trigger dalla tappa) serve al filtro realtime.
export const itemVotes = pgTable(
  "item_votes",
  {
    itineraryItemId: uuid("itinerary_item_id")
      .notNull()
      .references(() => itineraryItems.id, { onDelete: "cascade" }),
    itineraryId: uuid("itinerary_id")
      .notNull()
      .references(() => itineraries.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    value: smallint("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.itineraryItemId, t.userId] }),
    index("item_votes_user_id_idx").on(t.userId),
    index("item_votes_itinerary_id_idx").on(t.itineraryId),
    check("item_votes_value_valid", sql`${t.value} in (-1, 1)`),
  ],
);

// Registro delle modifiche di un viaggio di gruppo (passo 4.2). Solo dati strutturati nel payload:
// titoli e giorni (1-based), nessuna frase. Immutabile: nessun update né delete (vedi custom SQL).
export const itineraryChanges = pgTable(
  "itinerary_changes",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    itineraryId: uuid("itinerary_id")
      .notNull()
      .references(() => itineraries.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, string | number | null>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("itinerary_changes_itinerary_id_idx").on(t.itineraryId, t.id),
    // Il registro lo scrivono i membri (insert con RLS): payload piccolo, solo un oggetto di dati.
    check(
      "itinerary_changes_payload_small",
      sql`jsonb_typeof(${t.payload}) = 'object' and pg_column_size(${t.payload}) <= 1024`,
    ),
    check(
      "itinerary_changes_kind_valid",
      sql`${t.kind} in ('stop_added','stop_removed','stop_moved','stop_replaced','day_added','day_removed','proposal_accepted')`,
    ),
  ],
);

// Proposta di aggiunta di un'attività da un membro non proprietario. Solo il proprietario del gruppo
// la decide (decide_proposal): nessun update diretto dal client.
export const itineraryProposals = pgTable(
  "itinerary_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itineraryId: uuid("itinerary_id")
      .notNull()
      .references(() => itineraries.id, { onDelete: "cascade" }),
    proposedBy: uuid("proposed_by").references(() => profiles.id, { onDelete: "set null" }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "restrict" }),
    dayIndex: smallint("day_index").notNull(),
    status: text("status").notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => profiles.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("itinerary_proposals_itinerary_status_idx").on(t.itineraryId, t.status),
    index("itinerary_proposals_proposed_by_idx").on(t.proposedBy),
    index("itinerary_proposals_activity_id_idx").on(t.activityId),
    check("itinerary_proposals_day_index_non_negative", sql`${t.dayIndex} >= 0`),
    check("itinerary_proposals_status_valid", sql`${t.status} in ('pending','accepted','rejected')`),
  ],
);
