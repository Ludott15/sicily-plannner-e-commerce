CREATE TABLE "box_items" (
	"box_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" smallint DEFAULT 1 NOT NULL,
	CONSTRAINT "box_items_box_id_product_id_pk" PRIMARY KEY("box_id","product_id"),
	CONSTRAINT "box_items_quantity_positive" CHECK ("box_items"."quantity" > 0),
	CONSTRAINT "box_items_not_self" CHECK ("box_items"."box_id" <> "box_items"."product_id")
);
--> statement-breakpoint
CREATE TABLE "product_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "product_links_kind_valid" CHECK ("product_links"."kind" in ('place','activity')),
	CONSTRAINT "product_links_position_non_negative" CHECK ("product_links"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_media" (
	"product_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "product_media_product_id_media_id_pk" PRIMARY KEY("product_id","media_id"),
	CONSTRAINT "product_media_position_non_negative" CHECK ("product_media"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'manual' NOT NULL,
	"contact_email" text NOT NULL,
	"portal_url" text,
	"adapter_key" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_kind_valid" CHECK ("suppliers"."kind" in ('manual','api')),
	CONSTRAINT "suppliers_name_length" CHECK (char_length(btrim("suppliers"."name")) between 1 and 200),
	CONSTRAINT "suppliers_contact_email_format" CHECK ("suppliers"."contact_email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
	CONSTRAINT "suppliers_portal_url_https" CHECK ("suppliers"."portal_url" is null or "suppliers"."portal_url" ~ '^https://'),
	CONSTRAINT "suppliers_api_has_adapter" CHECK ("suppliers"."kind" = 'manual' or "suppliers"."adapter_key" is not null)
);
--> statement-breakpoint
ALTER TABLE "producers" DROP CONSTRAINT "producers_lead_time_positive";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_weight_positive";--> statement-breakpoint
ALTER TABLE "producers" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "weight_g" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "is_active" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "producers" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "producers" ADD COLUMN "story_it" text;--> statement-breakpoint
ALTER TABLE "producers" ADD COLUMN "story_en" text;--> statement-breakpoint
ALTER TABLE "producers" ADD COLUMN "area_id" uuid;--> statement-breakpoint
ALTER TABLE "producers" ADD COLUMN "place_id" uuid;--> statement-breakpoint
ALTER TABLE "producers" ADD COLUMN "cover_media_id" uuid;--> statement-breakpoint
ALTER TABLE "producers" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "supplier_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "supplier_sku" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "title_en" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "description_en" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category" text NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "format_label" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "cost_cents" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "vat_rate" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "ingredients_it" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "ingredients_en" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "allergens" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "allergens_declared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "storage_it" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "storage_en" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "min_shelf_life_days" smallint;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_perishable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stock_status" text DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "lead_time_days" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "area_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "place_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "cover_media_id" uuid;--> statement-breakpoint
ALTER TABLE "box_items" ADD CONSTRAINT "box_items_box_id_products_id_fk" FOREIGN KEY ("box_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_items" ADD CONSTRAINT "box_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_links" ADD CONSTRAINT "product_links_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "box_items_product_id_idx" ON "box_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_links_unique" ON "product_links" USING btree ("product_id","kind","target_id");--> statement-breakpoint
CREATE INDEX "product_links_target_idx" ON "product_links" USING btree ("kind","target_id");--> statement-breakpoint
CREATE INDEX "product_media_media_id_idx" ON "product_media" USING btree ("media_id");--> statement-breakpoint
ALTER TABLE "producers" ADD CONSTRAINT "producers_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producers" ADD CONSTRAINT "producers_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producers" ADD CONSTRAINT "producers_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "producers_area_id_idx" ON "producers" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "producers_place_id_idx" ON "producers" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "producers_cover_media_id_idx" ON "producers" USING btree ("cover_media_id");--> statement-breakpoint
CREATE INDEX "products_supplier_id_idx" ON "products" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "products_area_id_idx" ON "products" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "products_place_id_idx" ON "products" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "products_cover_media_id_idx" ON "products" USING btree ("cover_media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_supplier_sku_unique" ON "products" USING btree ("supplier_id","supplier_sku") WHERE "products"."supplier_sku" is not null;--> statement-breakpoint
ALTER TABLE "producers" ADD CONSTRAINT "producers_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "producers" ADD CONSTRAINT "producers_slug_format" CHECK ("producers"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "producers" ADD CONSTRAINT "producers_name_length" CHECK (char_length(btrim("producers"."name")) between 1 and 200);--> statement-breakpoint
ALTER TABLE "producers" ADD CONSTRAINT "producers_story_length" CHECK (char_length("producers"."story_it") <= 4000 and char_length("producers"."story_en") <= 4000);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_slug_format" CHECK ("products"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_title_length" CHECK (char_length(btrim("products"."title")) between 1 and 200);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_sku_length" CHECK (char_length(btrim("products"."supplier_sku")) between 1 and 80);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_active_requires_allergens_declared" CHECK (not "products"."is_active" or "products"."allergens_declared");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_valid" CHECK ("products"."category" in ('dolci','conserve','olio','vino','pasta','formaggi','spezie','box','altro'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_cost_non_negative" CHECK ("products"."cost_cents" is null or "products"."cost_cents" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_vat_rate_valid" CHECK ("products"."vat_rate" in (4, 10, 22));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_allergens_valid" CHECK ("products"."allergens" <@ array['gluten','crustaceans','eggs','fish','peanuts','soybeans','milk','nuts','celery','mustard','sesame','sulphites','lupin','molluscs']::text[]);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_min_shelf_life_positive" CHECK ("products"."min_shelf_life_days" is null or "products"."min_shelf_life_days" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stock_status_valid" CHECK ("products"."stock_status" in ('available','on_request','unavailable'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_lead_time_positive" CHECK ("products"."lead_time_days" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_description_length" CHECK (char_length("products"."description") <= 2000 and char_length("products"."description_en") <= 2000);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_weight_positive" CHECK ("products"."weight_g" is null or "products"."weight_g" > 0);
--> statement-breakpoint
alter table "box_items" enable row level security;--> statement-breakpoint
revoke all on table "box_items" from anon, authenticated;
--> statement-breakpoint
alter table "product_links" enable row level security;--> statement-breakpoint
revoke all on table "product_links" from anon, authenticated;
--> statement-breakpoint
alter table "product_media" enable row level security;--> statement-breakpoint
revoke all on table "product_media" from anon, authenticated;
--> statement-breakpoint
alter table "suppliers" enable row level security;--> statement-breakpoint
revoke all on table "suppliers" from anon, authenticated;
