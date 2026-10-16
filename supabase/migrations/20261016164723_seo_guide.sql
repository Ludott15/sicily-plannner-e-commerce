CREATE TABLE "guide_links" (
	"guide_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "guide_links_guide_id_kind_target_id_pk" PRIMARY KEY("guide_id","kind","target_id"),
	CONSTRAINT "guide_links_kind_valid" CHECK ("guide_links"."kind" in ('place', 'activity', 'itinerary', 'product')),
	CONSTRAINT "guide_links_position_range" CHECK ("guide_links"."position" between 0 and 99)
);
--> statement-breakpoint
CREATE TABLE "guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title_it" text NOT NULL,
	"title_en" text,
	"summary_it" text,
	"summary_en" text,
	"body_it" text NOT NULL,
	"body_en" text,
	"author_name" text NOT NULL,
	"cover_media_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guides_slug_unique" UNIQUE("slug"),
	CONSTRAINT "guides_slug_format" CHECK ("guides"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "guides_status_valid" CHECK ("guides"."status" in ('draft', 'published')),
	CONSTRAINT "guides_published_at" CHECK ("guides"."status" = 'draft' or "guides"."published_at" is not null),
	CONSTRAINT "guides_title_it_length" CHECK (char_length(btrim("guides"."title_it")) between 1 and 160),
	CONSTRAINT "guides_title_en_length" CHECK (char_length("guides"."title_en") <= 160),
	CONSTRAINT "guides_summary_length" CHECK (char_length("guides"."summary_it") <= 300 and char_length("guides"."summary_en") <= 300),
	CONSTRAINT "guides_body_it_length" CHECK (char_length(btrim("guides"."body_it")) between 1 and 60000),
	CONSTRAINT "guides_body_en_length" CHECK (char_length("guides"."body_en") <= 60000),
	CONSTRAINT "guides_author_name_length" CHECK (char_length(btrim("guides"."author_name")) between 2 and 120)
);
--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "description_it" text;--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "description_en" text;--> statement-breakpoint
ALTER TABLE "guide_links" ADD CONSTRAINT "guide_links_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guide_links_target_idx" ON "guide_links" USING btree ("kind","target_id");--> statement-breakpoint
CREATE INDEX "guides_cover_media_id_idx" ON "guides" USING btree ("cover_media_id");--> statement-breakpoint
CREATE INDEX "guides_published_at_idx" ON "guides" USING btree ("published_at") WHERE "guides"."status" = 'published';--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_description_length" CHECK (char_length("areas"."description_it") <= 1200 and char_length("areas"."description_en") <= 1200);