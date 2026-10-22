CREATE TABLE "place_leg_failures" (
	"from_place_id" uuid NOT NULL,
	"to_place_id" uuid NOT NULL,
	"failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_leg_failures_from_place_id_to_place_id_pk" PRIMARY KEY("from_place_id","to_place_id"),
	CONSTRAINT "place_leg_failures_distinct_places" CHECK ("place_leg_failures"."from_place_id" <> "place_leg_failures"."to_place_id")
);
--> statement-breakpoint
ALTER TABLE "place_leg_failures" ADD CONSTRAINT "place_leg_failures_from_place_id_places_id_fk" FOREIGN KEY ("from_place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_leg_failures" ADD CONSTRAINT "place_leg_failures_to_place_id_places_id_fk" FOREIGN KEY ("to_place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "place_legs_to_place_id_idx" ON "place_legs" USING btree ("to_place_id");--> statement-breakpoint
alter table "place_leg_failures" enable row level security;--> statement-breakpoint
revoke all on table "place_leg_failures" from anon, authenticated;--> statement-breakpoint
-- Solo admin: nessun grant ai client e nessuna policy (la RLS attiva li chiude). Lettura e scrittura con dbAdmin (cron route-legs e maps:legs).
