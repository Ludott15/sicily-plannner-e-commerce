import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

// Sessioni di checkout (passo 7.2). Una riga per ogni tentativo di pagamento: contiene lo snapshot del
// carrello calcolato dal server e i punti scalati. Il webhook (checkout.session.completed, passo 7.3)
// la chiude o la fa scadere. Scritta solo da funzioni SQL SECURITY DEFINER e dal webhook (dbAdmin);
// il cliente legge solo le sue (RLS in supabase/custom-checkout.sql).
export const checkoutSessions = pgTable(
  "checkout_sessions",
  {
    id: uuid("id").primaryKey(),
    // Id della sessione Stripe (o di prova). Null finché la sessione non è creata.
    stripeSessionId: text("stripe_session_id").unique(),
    // Null per gli ospiti e dopo l'eliminazione dell'account (obblighi fiscali: la riga resta).
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    // Snapshot: [{ productId, quantity, unitPriceCents, vatRate, title }], prezzi IVA inclusa.
    cart: jsonb("cart").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    pointsRedeemed: integer("points_redeemed").notNull().default(0),
    // SHA-256 (hex) del token monouso della riga: il token sta solo nel server che ha creato la sessione.
    // attach e release lo richiedono, così un uuid da solo non basta a toccare la riga.
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("checkout_sessions_user_id_idx").on(t.userId),
    index("checkout_sessions_status_idx").on(t.status),
    check("checkout_sessions_status_valid", sql`${t.status} in ('open','completed','expired','failed')`),
    check("checkout_sessions_stripe_id_format", sql`${t.stripeSessionId} is null or ${t.stripeSessionId} ~ '^cs_[A-Za-z0-9_]+$'`),
    check("checkout_sessions_cart_is_array", sql`jsonb_typeof(${t.cart}) = 'array'`),
    check("checkout_sessions_token_hash_format", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "checkout_sessions_amounts_non_negative",
      sql`${t.subtotalCents} >= 0 and ${t.shippingCents} >= 0 and ${t.discountCents} >= 0 and ${t.pointsRedeemed} >= 0`,
    ),
    check("checkout_sessions_discount_max_15_percent", sql`${t.discountCents} * 100 <= ${t.subtotalCents} * 15`),
    check("checkout_sessions_discount_whole_euros", sql`${t.discountCents} % 100 = 0`),
  ],
);

// Eventi Stripe già ricevuti: il webhook inserisce l'id nella stessa transazione in cui lavora sull'evento,
// così un evento ripetuto non ha effetti (idempotenza). Letta solo dall'admin.
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});
