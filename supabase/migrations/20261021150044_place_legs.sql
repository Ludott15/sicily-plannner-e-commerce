CREATE TABLE "place_legs" (
	"from_place_id" uuid NOT NULL,
	"to_place_id" uuid NOT NULL,
	"distance_m" integer NOT NULL,
	"duration_s" integer NOT NULL,
	"geometry" jsonb NOT NULL,
	"source" text DEFAULT 'osrm' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_legs_from_place_id_to_place_id_pk" PRIMARY KEY("from_place_id","to_place_id"),
	CONSTRAINT "place_legs_distinct_places" CHECK ("place_legs"."from_place_id" <> "place_legs"."to_place_id"),
	CONSTRAINT "place_legs_distance_non_negative" CHECK ("place_legs"."distance_m" >= 0),
	CONSTRAINT "place_legs_duration_non_negative" CHECK ("place_legs"."duration_s" >= 0),
	CONSTRAINT "place_legs_source_osrm" CHECK ("place_legs"."source" = 'osrm'),
	CONSTRAINT "place_legs_geometry_size" CHECK (case when jsonb_typeof("place_legs"."geometry") = 'array' then jsonb_array_length("place_legs"."geometry") between 2 and 400 else false end)
);
--> statement-breakpoint
ALTER TABLE "place_legs" ADD CONSTRAINT "place_legs_from_place_id_places_id_fk" FOREIGN KEY ("from_place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_legs" ADD CONSTRAINT "place_legs_to_place_id_places_id_fk" FOREIGN KEY ("to_place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
alter table "place_legs" enable row level security;--> statement-breakpoint
revoke all on table "place_legs" from anon, authenticated;
