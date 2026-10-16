import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { areas, places } from "./catalog";
import { media } from "./media";
import { orderStatus } from "./enums";
import { profiles } from "./profiles";

// Vocabolari chiusi dello shop. Le liste sono ripetute nei check qui sotto e in
// src/lib/shop/config.ts e allergens.ts: il test src/lib/shop/schema-vocabulary.test.ts
// verifica che coincidano.
const CATEGORY_SQL = "'dolci','conserve','olio','vino','pasta','formaggi','spezie','box','altro'";
const STOCK_SQL = "'available','on_request','unavailable'";
const ALLERGEN_SQL =
  "'gluten','crustaceans','eggs','fish','peanuts','soybeans','milk','nuts','celery','mustard','sesame','sulphites','lupin','molluscs'";

// Fornitore logistico (dropshipping): magazzino e spedizione del prodotto, verso Isula.
// Non ha grant ai client: il nome e i contatti del fornitore non escono mai nelle pagine.
export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // manual: l'admin inoltra l'ordine (email o portale) e registra corriere e tracking.
    // api: adattatore dietro l'interfaccia SupplierAdapter, inattivo senza chiave.
    kind: text("kind").notNull().default("manual"),
    contactEmail: text("contact_email").notNull(),
    portalUrl: text("portal_url"),
    adapterKey: text("adapter_key"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("suppliers_kind_valid", sql`${t.kind} in ('manual','api')`),
    check("suppliers_name_length", sql`char_length(btrim(${t.name})) between 1 and 200`),
    check("suppliers_contact_email_format", sql`${t.contactEmail} ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'`),
    check("suppliers_portal_url_https", sql`${t.portalUrl} is null or ${t.portalUrl} ~ '^https://'`),
    check("suppliers_api_has_adapter", sql`${t.kind} = 'manual' or ${t.adapterKey} is not null`),
  ],
);

// Marchio o produttore di origine: chi fa il prodotto, con la sua storia e il territorio.
// È un'informazione editoriale, distinta dal fornitore che spedisce (suppliers).
// Pubblico solo se is_public e is_active. Email, partita IVA e indirizzo non hanno grant
// ai client: li legge l'admin con dbAdmin.
export const producers = pgTable(
  "producers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    storyIt: text("story_it"),
    storyEn: text("story_en"),
    email: text("email"),
    vatNumber: text("vat_number"),
    address: text("address"),
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "set null" }),
    placeId: uuid("place_id").references(() => places.id, { onDelete: "set null" }),
    coverMediaId: uuid("cover_media_id").references(() => media.id, { onDelete: "set null" }),
    isPublic: boolean("is_public").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("producers_area_id_idx").on(t.areaId),
    index("producers_place_id_idx").on(t.placeId),
    index("producers_cover_media_id_idx").on(t.coverMediaId),
    check("producers_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("producers_name_length", sql`char_length(btrim(${t.name})) between 1 and 200`),
    check("producers_story_length", sql`char_length(${t.storyIt}) <= 4000 and char_length(${t.storyEn}) <= 4000`),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    producerId: uuid("producer_id")
      .notNull()
      .references(() => producers.id, { onDelete: "restrict" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    // Codice del prodotto presso il fornitore: serve per l'inoltro dell'ordine e per l'import.
    supplierSku: text("supplier_sku"),
    title: text("title").notNull(),
    titleEn: text("title_en"),
    description: text("description"),
    descriptionEn: text("description_en"),
    category: text("category").notNull(),
    // Formato in chiaro, es. "vasetto 190 g".
    formatLabel: text("format_label"),
    // Prezzo di vendita, IVA inclusa.
    priceCents: integer("price_cents").notNull(),
    // Costo d'acquisto dal fornitore: solo admin, mai in uscita dalle letture pubbliche.
    costCents: integer("cost_cents"),
    vatRate: smallint("vat_rate").notNull(),
    // Peso in grammi: non è nel form attuale; servirà alla spedizione quando sarà definita.
    weightG: integer("weight_g"),
    ingredientsIt: text("ingredients_it"),
    ingredientsEn: text("ingredients_en"),
    allergens: text("allergens").array().notNull().default(sql`'{}'`),
    // Assenza di allergeni dichiarata: un prodotto si attiva solo con l'elenco verificato
    // (check products_active_requires_allergens_declared). Lista vuota e dichiarato = "nessuno dei 14".
    allergensDeclared: boolean("allergens_declared").notNull().default(false),
    storageIt: text("storage_it"),
    storageEn: text("storage_en"),
    // Scadenza minima alla consegna, in giorni (per i prodotti con data di scadenza).
    minShelfLifeDays: smallint("min_shelf_life_days"),
    // Deperibile: escluso dal recesso (art. 59 Codice del consumo); lo dicono pagina, carrello e condizioni.
    isPerishable: boolean("is_perishable").notNull().default(false),
    // Disponibilità comunicata dal fornitore (niente quantità: il magazzino è del fornitore).
    stockStatus: text("stock_status").notNull().default("available"),
    // Giorni lavorativi di evasione del fornitore, mostrati al cliente.
    leadTimeDays: smallint("lead_time_days").notNull().default(3),
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "set null" }),
    placeId: uuid("place_id").references(() => places.id, { onDelete: "set null" }),
    // Copertina dalla galleria media (crediti e licenze in docs/IMMAGINI.md).
    coverMediaId: uuid("cover_media_id").references(() => media.id, { onDelete: "set null" }),
    // Non si usa più: le foto passano da cover_media_id e product_media. Resta finché
    // non si verifica che in produzione sia vuota, poi si elimina con una migrazione.
    images: text("images").array().notNull().default(sql`'{}'`),
    isBox: boolean("is_box").notNull().default(false),
    isActive: boolean("is_active").notNull().default(false),
    stripePriceId: text("stripe_price_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("products_producer_id_idx").on(t.producerId),
    index("products_supplier_id_idx").on(t.supplierId),
    index("products_area_id_idx").on(t.areaId),
    index("products_place_id_idx").on(t.placeId),
    index("products_cover_media_id_idx").on(t.coverMediaId),
    uniqueIndex("products_supplier_sku_unique").on(t.supplierId, t.supplierSku).where(sql`${t.supplierSku} is not null`),
    check("products_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("products_title_length", sql`char_length(btrim(${t.title})) between 1 and 200`),
    check("products_supplier_sku_length", sql`char_length(btrim(${t.supplierSku})) between 1 and 80`),
    check("products_active_requires_allergens_declared", sql`not ${t.isActive} or ${t.allergensDeclared}`),
    check("products_category_valid", sql`${t.category} in (${sql.raw(CATEGORY_SQL)})`),
    check("products_price_non_negative", sql`${t.priceCents} >= 0`),
    check("products_cost_non_negative", sql`${t.costCents} is null or ${t.costCents} >= 0`),
    check("products_vat_rate_valid", sql`${t.vatRate} in (4, 10, 22)`),
    check("products_weight_positive", sql`${t.weightG} is null or ${t.weightG} > 0`),
    check("products_allergens_valid", sql`${t.allergens} <@ array[${sql.raw(ALLERGEN_SQL)}]::text[]`),
    check("products_min_shelf_life_positive", sql`${t.minShelfLifeDays} is null or ${t.minShelfLifeDays} > 0`),
    check("products_stock_status_valid", sql`${t.stockStatus} in (${sql.raw(STOCK_SQL)})`),
    check("products_lead_time_positive", sql`${t.leadTimeDays} > 0`),
    check(
      "products_description_length",
      sql`char_length(${t.description}) <= 2000 and char_length(${t.descriptionEn}) <= 2000`,
    ),
  ],
);

// Galleria di un prodotto: foto dal sistema media (crediti in docs/IMMAGINI.md).
export const productMedia = pgTable(
  "product_media",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    position: smallint("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.mediaId] }),
    index("product_media_media_id_idx").on(t.mediaId),
    check("product_media_position_non_negative", sql`${t.position} >= 0`),
  ],
);

// Collegamenti "Dal territorio": un prodotto porta a un luogo o a un'attività (il pistacchio
// porta a Bronte). target_id non ha foreign key: il trigger product_links_target_exists verifica
// che il bersaglio esista nella tabella del suo tipo.
export const productLinks = pgTable(
  "product_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    targetId: uuid("target_id").notNull(),
    position: smallint("position").notNull().default(0),
  },
  (t) => [
    uniqueIndex("product_links_unique").on(t.productId, t.kind, t.targetId),
    index("product_links_target_idx").on(t.kind, t.targetId),
    check("product_links_kind_valid", sql`${t.kind} in ('place','activity')`),
    check("product_links_position_non_negative", sql`${t.position} >= 0`),
  ],
);

// Composizione di una box: i prodotti che la compongono, con la quantità.
export const boxItems = pgTable(
  "box_items",
  {
    boxId: uuid("box_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: smallint("quantity").notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.boxId, t.productId] }),
    index("box_items_product_id_idx").on(t.productId),
    check("box_items_quantity_positive", sql`${t.quantity} > 0`),
    check("box_items_not_self", sql`${t.boxId} <> ${t.productId}`),
  ],
);

// user_id null: ordine di un ospite, oppure account eliminato. Gli ordini restano
// per obblighi fiscali, quindi l'eliminazione dell'account imposta user_id a null.
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    status: orderStatus("status").notNull().default("pending"),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    pointsRedeemed: integer("points_redeemed").notNull().default(0),
    stripeSessionId: text("stripe_session_id").notNull().unique(),
    shippingAddress: jsonb("shipping_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_user_id_idx").on(t.userId),
    index("orders_status_idx").on(t.status),
    check(
      "orders_amounts_non_negative",
      sql`${t.subtotalCents} >= 0 and ${t.discountCents} >= 0 and ${t.shippingCents} >= 0 and ${t.pointsRedeemed} >= 0`,
    ),
    check(
      "orders_total_consistent",
      sql`${t.totalCents} = ${t.subtotalCents} - ${t.discountCents} + ${t.shippingCents}`,
    ),
    check("orders_discount_max_15_percent", sql`${t.discountCents} * 100 <= ${t.subtotalCents} * 15`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    producerId: uuid("producer_id")
      .notNull()
      .references(() => producers.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("order_items_order_id_idx").on(t.orderId),
    check("order_items_quantity_positive", sql`${t.quantity} > 0`),
    check("order_items_unit_price_non_negative", sql`${t.unitPriceCents} >= 0`),
  ],
);

// Una spedizione per produttore coinvolto nell'ordine. Il token del link al produttore
// esiste in chiaro solo nell'email: qui c'è l'hash SHA-256 (hex).
export const orderShipments = pgTable(
  "order_shipments",
  {
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    producerId: uuid("producer_id")
      .notNull()
      .references(() => producers.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull().unique(),
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.orderId, t.producerId] }),
    check("order_shipments_token_hash_format", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
  ],
);
