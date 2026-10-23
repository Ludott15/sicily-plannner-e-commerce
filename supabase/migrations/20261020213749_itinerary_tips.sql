ALTER TABLE "itineraries" ADD COLUMN "tips" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_tips_length" CHECK (public.text_array_max_length("itineraries"."tips") <= 260);--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_tips_count" CHECK (cardinality("itineraries"."tips") <= 3);