CREATE TYPE "public"."event_type" AS ENUM('view', 'save', 'unsave', 'add_to_itinerary', 'remove_from_itinerary', 'affiliate_click', 'vote_up', 'vote_down', 'review');--> statement-breakpoint
CREATE TYPE "public"."partner" AS ENUM('travelpayouts', 'getyourguide', 'viator', 'car_rental', 'internal');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"place_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"duration_min" integer NOT NULL,
	"price_from_eur" numeric(8, 2),
	"requires_car" boolean DEFAULT false NOT NULL,
	"accessible" boolean DEFAULT false NOT NULL,
	"season_months" smallint[] DEFAULT '{1,2,3,4,5,6,7,8,9,10,11,12}' NOT NULL,
	"partner" "partner" DEFAULT 'internal' NOT NULL,
	"partner_product_id" text,
	"affiliate_url" text,
	"rating" numeric(2, 1),
	"embedding" vector(1024),
	"is_active" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_slug_unique" UNIQUE("slug"),
	CONSTRAINT "activities_partner_product_unique" UNIQUE("partner","partner_product_id"),
	CONSTRAINT "activities_duration_positive" CHECK ("activities"."duration_min" > 0),
	CONSTRAINT "activities_price_non_negative" CHECK ("activities"."price_from_eur" >= 0),
	CONSTRAINT "activities_rating_range" CHECK ("activities"."rating" between 0 and 5),
	CONSTRAINT "activities_season_months_valid" CHECK ("activities"."season_months" <@ '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[])
);
--> statement-breakpoint
CREATE TABLE "activity_interests" (
	"activity_id" uuid NOT NULL,
	"interest_key" text NOT NULL,
	"strength" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_interests_activity_id_interest_key_pk" PRIMARY KEY("activity_id","interest_key"),
	CONSTRAINT "activity_interests_strength_range" CHECK ("activity_interests"."strength" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "interests" (
	"key" text PRIMARY KEY NOT NULL,
	"label_it" text NOT NULL,
	"label_en" text NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"province" char(2) NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"description" text,
	"cover_image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "places_slug_unique" UNIQUE("slug"),
	CONSTRAINT "places_lat_range" CHECK ("places"."lat" between -90 and 90),
	CONSTRAINT "places_lng_range" CHECK ("places"."lng" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "preference_weights" (
	"user_id" uuid NOT NULL,
	"interest_key" text NOT NULL,
	"explicit" smallint DEFAULT 0 NOT NULL,
	"implicit" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preference_weights_user_id_interest_key_pk" PRIMARY KEY("user_id","interest_key"),
	CONSTRAINT "preference_weights_explicit_range" CHECK ("preference_weights"."explicit" between 0 and 5),
	CONSTRAINT "preference_weights_implicit_range" CHECK ("preference_weights"."implicit" between -2 and 2)
);
--> statement-breakpoint
CREATE TABLE "user_constraints" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"budget_per_day_eur" integer,
	"has_car" boolean DEFAULT false NOT NULL,
	"reduced_mobility" boolean DEFAULT false NOT NULL,
	"diet" text[] DEFAULT '{}' NOT NULL,
	"max_daily_travel_min" integer,
	"heat_tolerance" smallint,
	"crowd_tolerance" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_constraints_budget_non_negative" CHECK ("user_constraints"."budget_per_day_eur" >= 0),
	CONSTRAINT "user_constraints_travel_positive" CHECK ("user_constraints"."max_daily_travel_min" > 0),
	CONSTRAINT "user_constraints_heat_range" CHECK ("user_constraints"."heat_tolerance" between 0 and 5),
	CONSTRAINT "user_constraints_crowd_range" CHECK ("user_constraints"."crowd_tolerance" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "user_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "event_type" NOT NULL,
	"activity_id" uuid,
	"itinerary_id" uuid,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_taste" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"embedding" vector(1024),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_interests" ADD CONSTRAINT "activity_interests_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_interests" ADD CONSTRAINT "activity_interests_interest_key_interests_key_fk" FOREIGN KEY ("interest_key") REFERENCES "public"."interests"("key") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "preference_weights" ADD CONSTRAINT "preference_weights_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_weights" ADD CONSTRAINT "preference_weights_interest_key_interests_key_fk" FOREIGN KEY ("interest_key") REFERENCES "public"."interests"("key") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_constraints" ADD CONSTRAINT "user_constraints_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_events" ADD CONSTRAINT "user_events_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_events" ADD CONSTRAINT "user_events_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_taste" ADD CONSTRAINT "user_taste_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_place_id_idx" ON "activities" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "activities_is_active_partner_idx" ON "activities" USING btree ("is_active","partner");--> statement-breakpoint
CREATE INDEX "activities_embedding_idx" ON "activities" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "activity_interests_interest_key_idx" ON "activity_interests" USING btree ("interest_key");--> statement-breakpoint
CREATE INDEX "user_events_unprocessed_idx" ON "user_events" USING btree ("user_id") WHERE "user_events"."processed_at" is null;--> statement-breakpoint
CREATE INDEX "user_taste_embedding_idx" ON "user_taste" USING hnsw ("embedding" vector_cosine_ops);