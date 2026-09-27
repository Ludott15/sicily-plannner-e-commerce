CREATE TYPE "public"."point_reason" AS ENUM('profile_completed', 'invite_accepted', 'review', 'check_in', 'itinerary_completed', 'order', 'redeem', 'redeem_refund', 'admin_adjust');--> statement-breakpoint
CREATE TABLE "badges" (
	"key" text PRIMARY KEY NOT NULL,
	"name_it" text NOT NULL,
	"name_en" text NOT NULL,
	"description" text,
	"criteria" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"itinerary_id" uuid,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"local_date" date DEFAULT (now() at time zone 'Europe/Rome')::date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_ins_user_place_day_unique" UNIQUE("user_id","place_id","local_date"),
	CONSTRAINT "check_ins_lat_range" CHECK ("check_ins"."lat" between -90 and 90),
	CONSTRAINT "check_ins_lng_range" CHECK ("check_ins"."lng" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "points_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" "point_reason" NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"season" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "points_ledger_user_reason_ref_unique" UNIQUE("user_id","reason","ref_id"),
	CONSTRAINT "points_ledger_delta_non_zero" CHECK ("points_ledger"."delta" <> 0),
	CONSTRAINT "points_ledger_season_format" CHECK ("points_ledger"."season" ~ '^[0-9]{4}-(estate|inverno)$')
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_user_activity_unique" UNIQUE("user_id","activity_id"),
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" between 1 and 5),
	CONSTRAINT "reviews_body_length" CHECK (char_length("reviews"."body") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"user_id" uuid NOT NULL,
	"badge_key" text NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_badges_user_id_badge_key_pk" PRIMARY KEY("user_id","badge_key")
);
--> statement-breakpoint
CREATE TABLE "affiliate_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"activity_id" uuid,
	"partner" "partner" NOT NULL,
	"target_url" text NOT NULL,
	"subid" text NOT NULL,
	"context" text NOT NULL,
	"itinerary_id" uuid,
	"anon_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_clicks_subid_unique" UNIQUE("subid"),
	CONSTRAINT "affiliate_clicks_context_valid" CHECK ("affiliate_clicks"."context" in ('page', 'itinerary', 'chat', 'flights')),
	CONSTRAINT "affiliate_clicks_target_url_https" CHECK ("affiliate_clicks"."target_url" ~ '^https://')
);
--> statement-breakpoint
CREATE TABLE "affiliate_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner" "partner" NOT NULL,
	"subid" text NOT NULL,
	"amount_eur" numeric(10, 2),
	"commission_eur" numeric(10, 2),
	"status" text NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "leaderboard_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_key_badges_key_fk" FOREIGN KEY ("badge_key") REFERENCES "public"."badges"("key") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_ins_user_date_idx" ON "check_ins" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "points_ledger_season_user_idx" ON "points_ledger" USING btree ("season","user_id");--> statement-breakpoint
CREATE INDEX "reviews_activity_id_idx" ON "reviews" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "affiliate_clicks_created_at_idx" ON "affiliate_clicks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "affiliate_conversions_subid_idx" ON "affiliate_conversions" USING btree ("subid");