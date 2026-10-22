-- Guardia: le colonne nuove di order_items sono NOT NULL senza default, quindi la migrazione si ferma se
-- la tabella ha già righe (non dovrebbe averne: le righe le scrive solo il webhook dal passo 7.3).
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.order_items) THEN
    RAISE EXCEPTION 'order_items_not_empty';
  END IF;
END
$guard$;--> statement-breakpoint
-- Numero d'ordine (passo 7.3): sequenza e funzione usate come default di orders.order_number. Vanno
-- prima delle colonne, che le usano come default: le righe già presenti ricevono un numero.
-- Formato ISU-AAAA-NNNNNN; l'anno è quello di creazione, la sequenza non si azzera.
CREATE SEQUENCE IF NOT EXISTS "public"."order_number_seq";--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."next_order_number"() RETURNS text
LANGUAGE sql VOLATILE SET search_path = public, pg_temp AS $$
  select 'ISU-' || to_char(now() at time zone 'Europe/Rome', 'YYYY') || '-' || lpad(nextval('public.order_number_seq')::text, 6, '0');
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."next_order_number"() FROM public, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."order_number_seq" FROM public, anon, authenticated;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "supplier_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "supplier_sku" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "title_snapshot" text NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "vat_rate" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "cost_cents_snapshot" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_number" text DEFAULT public.next_order_number() NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "locale" text DEFAULT 'it' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "supplier_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_session_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "access_token_hash" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "carrier" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_number" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_url" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "problem_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "forwarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "supplier_delay_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_session_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_supplier_id_idx" ON "order_items" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "orders_supplier_status_idx" ON "orders" USING btree ("supplier_status");--> statement-breakpoint
CREATE INDEX "orders_checkout_session_id_idx" ON "orders" USING btree ("checkout_session_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_number_unique" UNIQUE("order_number");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_vat_rate_valid" CHECK ("order_items"."vat_rate" in (4, 10, 22));--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_cost_non_negative" CHECK ("order_items"."cost_cents_snapshot" is null or "order_items"."cost_cents_snapshot" >= 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_title_length" CHECK (char_length(btrim("order_items"."title_snapshot")) between 1 and 200);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_number_format" CHECK ("orders"."order_number" ~ '^ISU-[0-9]{4}-[0-9]{6}$');--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_locale_valid" CHECK ("orders"."locale" in ('it','en'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_supplier_status_valid" CHECK ("orders"."supplier_status" in ('pending','forwarded','confirmed','shipped','delivered','problem'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_amount_non_negative" CHECK ("orders"."paid_amount_cents" is null or "orders"."paid_amount_cents" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_intent_format" CHECK ("orders"."payment_intent_id" is null or "orders"."payment_intent_id" ~ '^pi_[A-Za-z0-9_]+$');--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_access_token_hash_format" CHECK ("orders"."access_token_hash" is null or "orders"."access_token_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tracking_url_https" CHECK ("orders"."tracking_url" is null or "orders"."tracking_url" ~ '^https://');--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_problem_note_length" CHECK ("orders"."problem_note" is null or char_length("orders"."problem_note") between 1 and 1000);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipped_has_date" CHECK ("orders"."status" not in ('shipped','delivered') or "orders"."shipped_at" is not null);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_has_date" CHECK ("orders"."status" <> 'delivered' or "orders"."delivered_at" is not null);