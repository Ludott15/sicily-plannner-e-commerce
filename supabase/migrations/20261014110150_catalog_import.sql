CREATE TABLE "activity_sources" (
	"activity_id" uuid PRIMARY KEY NOT NULL,
	"source_url" text,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_sources_source_url_format" CHECK ("activity_sources"."source_url" ~ '^https?://'),
	CONSTRAINT "activity_sources_source_url_length" CHECK (char_length("activity_sources"."source_url") <= 2000),
	CONSTRAINT "activity_sources_notes_length" CHECK (char_length("activity_sources"."notes") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "title_en" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "tagline_it" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_sources" ADD CONSTRAINT "activity_sources_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_needs_review_idx" ON "activities" USING btree ("needs_review") WHERE "activities"."needs_review";--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_tagline_it_length" CHECK (char_length("places"."tagline_it") <= 90);