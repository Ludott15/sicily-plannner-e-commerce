CREATE TYPE "public"."media_kind" AS ENUM('photo', 'illustration');--> statement-breakpoint
CREATE TYPE "public"."media_source_type" AS ENUM('own', 'licensed', 'partner', 'illustration');--> statement-breakpoint
CREATE TABLE "image_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"authority" text NOT NULL,
	"reference" text NOT NULL,
	"issued_on" date NOT NULL,
	"valid_until" date NOT NULL,
	"scope" text NOT NULL,
	"document_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "image_authorizations_dates" CHECK ("image_authorizations"."valid_until" >= "image_authorizations"."issued_on"),
	CONSTRAINT "image_authorizations_document_url_https" CHECK ("image_authorizations"."document_url" ~ '^https://'),
	CONSTRAINT "image_authorizations_authority_length" CHECK (char_length(btrim("image_authorizations"."authority")) between 1 and 200),
	CONSTRAINT "image_authorizations_reference_length" CHECK (char_length(btrim("image_authorizations"."reference")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_path" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"focal_x" double precision DEFAULT 0.5 NOT NULL,
	"focal_y" double precision DEFAULT 0.5 NOT NULL,
	"alt_it" text,
	"alt_en" text,
	"kind" "media_kind" NOT NULL,
	"source_type" "media_source_type" NOT NULL,
	"author" text,
	"author_url" text,
	"license" text,
	"license_url" text,
	"source_url" text,
	"source_link" text GENERATED ALWAYS AS (case when source_url ~ '^https://commons\.wikimedia\.org/' then source_url end) STORED,
	"accessed_at" date,
	"modified" boolean DEFAULT false NOT NULL,
	"credit_text" text GENERATED ALWAYS AS (case
  when kind = 'illustration' then 'Illustrazione di Isula'
  else 'Foto: ' || coalesce(nullif(btrim(author), ''), '?') || coalesce(', ' || nullif(btrim(license), ''), '')
    || case when modified then ' (modificata)' else '' end
end) STORED,
	"heritage_asset" boolean DEFAULT false NOT NULL,
	"authorization_id" uuid,
	"blur_data_url" text,
	"variants_version" integer DEFAULT 0 NOT NULL,
	"original_filename" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_storage_path_unique" UNIQUE("storage_path"),
	CONSTRAINT "media_dimensions_positive" CHECK ("media"."width" > 0 and "media"."height" > 0),
	CONSTRAINT "media_focal_range" CHECK ("media"."focal_x" between 0 and 1 and "media"."focal_y" between 0 and 1),
	CONSTRAINT "media_kind_matches_source" CHECK (("media"."kind" = 'illustration') = ("media"."source_type" = 'illustration')),
	CONSTRAINT "media_authorization_only_heritage" CHECK ("media"."authorization_id" is null or "media"."heritage_asset"),
	CONSTRAINT "media_storage_path_format" CHECK ("media"."storage_path" ~ '^[0-9a-f-]{36}/(master\.(jpg|png|webp)|illustration\.svg)$'),
	CONSTRAINT "media_author_url_http" CHECK ("media"."author_url" ~ '^https?://'),
	CONSTRAINT "media_license_url_http" CHECK ("media"."license_url" ~ '^https?://'),
	CONSTRAINT "media_source_url_https" CHECK ("media"."source_url" ~ '^https://'),
	CONSTRAINT "media_variants_version_non_negative" CHECK ("media"."variants_version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "cover_media_id" uuid;--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "cover_media_id" uuid;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "cover_media_id" uuid;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "is_featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "featured_order" smallint;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "is_home_hero" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "cover_media_id" uuid;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_authorization_id_image_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."image_authorizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_authorization_id_idx" ON "media" USING btree ("authorization_id");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_cover_media_id_idx" ON "activities" USING btree ("cover_media_id");--> statement-breakpoint
CREATE INDEX "places_cover_media_id_idx" ON "places" USING btree ("cover_media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "places_single_home_hero" ON "places" USING btree ("is_home_hero") WHERE "places"."is_home_hero";--> statement-breakpoint
CREATE INDEX "itineraries_cover_media_id_idx" ON "itineraries" USING btree ("cover_media_id");