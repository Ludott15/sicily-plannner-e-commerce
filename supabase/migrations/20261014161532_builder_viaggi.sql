CREATE TABLE "itinerary_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"itinerary_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "itinerary_share_links_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "itinerary_share_links_token_hash_format" CHECK ("itinerary_share_links"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "day_notes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "itinerary_share_links" ADD CONSTRAINT "itinerary_share_links_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_share_links" ADD CONSTRAINT "itinerary_share_links_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "itinerary_share_links_one_active_idx" ON "itinerary_share_links" USING btree ("itinerary_id") WHERE "itinerary_share_links"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "itinerary_share_links_created_by_idx" ON "itinerary_share_links" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_day_notes_within_days" CHECK (cardinality("itineraries"."day_notes") <= "itineraries"."days");--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_day_notes_length" CHECK (public.text_array_max_length("itineraries"."day_notes") <= 500);--> statement-breakpoint
-- RLS attiva nella stessa migrazione che crea la tabella (grant e policy nella migrazione successiva).
alter table public.itinerary_share_links enable row level security;--> statement-breakpoint
revoke all on table public.itinerary_share_links from anon, authenticated;
