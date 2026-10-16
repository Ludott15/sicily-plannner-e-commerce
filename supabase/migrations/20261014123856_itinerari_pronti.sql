
create or replace function public.text_array_max_length(p_values text[])
returns integer
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select coalesce(max(char_length(v)), 0)::integer
  from unnest(p_values) as v;
$$;
--> statement-breakpoint
CREATE TYPE "public"."time_slot" AS ENUM('morning', 'lunch', 'afternoon', 'evening');--> statement-breakpoint
CREATE TABLE "itinerary_nights" (
	"itinerary_id" uuid NOT NULL,
	"night_index" smallint NOT NULL,
	"area_id" uuid,
	"place_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itinerary_nights_itinerary_id_night_index_pk" PRIMARY KEY("itinerary_id","night_index"),
	CONSTRAINT "itinerary_nights_index_range" CHECK ("itinerary_nights"."night_index" between 1 and 59),
	CONSTRAINT "itinerary_nights_area_or_place" CHECK ("itinerary_nights"."area_id" is not null or "itinerary_nights"."place_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "subtitle" text;--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "season_months" smallint[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "suitable_for" "travel_party"[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "pace" "trip_pace";--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "day_intros" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD COLUMN "time_slot" time_slot;--> statement-breakpoint
ALTER TABLE "itinerary_nights" ADD CONSTRAINT "itinerary_nights_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_nights" ADD CONSTRAINT "itinerary_nights_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_nights" ADD CONSTRAINT "itinerary_nights_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "itinerary_nights_area_id_idx" ON "itinerary_nights" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "itinerary_nights_place_id_idx" ON "itinerary_nights" USING btree ("place_id");--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_subtitle_length" CHECK (char_length("itineraries"."subtitle") <= 140);--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_description_length" CHECK (char_length("itineraries"."description") <= 2000);--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_season_months_range" CHECK ("itineraries"."season_months" <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]);--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_day_intros_within_days" CHECK (cardinality("itineraries"."day_intros") <= "itineraries"."days");--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_day_intros_length" CHECK (public.text_array_max_length("itineraries"."day_intros") <= 280);--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_notes_length" CHECK (char_length("itinerary_items"."notes") <= 280);