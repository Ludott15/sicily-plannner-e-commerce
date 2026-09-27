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
  uuid,
} from "drizzle-orm/pg-core";
import { orderStatus } from "./enums";
import { profiles } from "./profiles";

export const producers = pgTable(
  "producers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    vatNumber: text("vat_number"),
    address: text("address"),
    leadTimeDays: smallint("lead_time_days").notNull().default(3),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("producers_lead_time_positive", sql`${t.leadTimeDays} > 0`)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    producerId: uuid("producer_id")
      .notNull()
      .references(() => producers.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    weightG: integer("weight_g").notNull(),
    images: text("images").array().notNull().default(sql`'{}'`),
    isBox: boolean("is_box").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    stripePriceId: text("stripe_price_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("products_producer_id_idx").on(t.producerId),
    check("products_price_non_negative", sql`${t.priceCents} >= 0`),
    check("products_weight_positive", sql`${t.weightG} > 0`),
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
