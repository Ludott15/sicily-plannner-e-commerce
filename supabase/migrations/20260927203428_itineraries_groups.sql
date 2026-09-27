CREATE TYPE "public"."group_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."itinerary_status" AS ENUM('draft', 'planned', 'in_progress', 'completed');--> statement-breakpoint
CREATE TABLE "group_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"email" text,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL,
	"max_uses" smallint DEFAULT 10 NOT NULL,
	"uses" smallint DEFAULT 0 NOT NULL,
	"status" "invite_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "group_invites_token_hash_format" CHECK ("group_invites"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "group_invites_max_uses_range" CHECK ("group_invites"."max_uses" between 1 and 10),
	CONSTRAINT "group_invites_uses_range" CHECK ("group_invites"."uses" between 0 and "group_invites"."max_uses"),
	CONSTRAINT "group_invites_expiry_max_7_days" CHECK ("group_invites"."expires_at" <= "group_invites"."created_at" + interval '7 days')
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "group_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"itinerary_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_name_length" CHECK (char_length(btrim("groups"."name")) between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "item_votes" (
	"itinerary_item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_votes_itinerary_item_id_user_id_pk" PRIMARY KEY("itinerary_item_id","user_id"),
	CONSTRAINT "item_votes_value_valid" CHECK ("item_votes"."value" in (-1, 1))
);
--> statement-breakpoint
CREATE TABLE "itineraries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"group_id" uuid,
	"title" text NOT NULL,
	"slug" text,
	"is_template" boolean DEFAULT false NOT NULL,
	"template_id" uuid,
	"start_date" date,
	"days" smallint NOT NULL,
	"status" "itinerary_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itineraries_slug_unique" UNIQUE("slug"),
	CONSTRAINT "itineraries_days_range" CHECK ("itineraries"."days" between 1 and 60),
	CONSTRAINT "itineraries_title_length" CHECK (char_length(btrim("itineraries"."title")) between 1 and 200),
	CONSTRAINT "itineraries_template_iff_editorial" CHECK (("itineraries"."owner_id" is null) = "itineraries"."is_template")
);
--> statement-breakpoint
CREATE TABLE "itinerary_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"itinerary_id" uuid NOT NULL,
	"day_index" smallint NOT NULL,
	"position" smallint NOT NULL,
	"activity_id" uuid,
	"place_id" uuid,
	"custom_title" text,
	"start_time" time,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itinerary_items_day_index_non_negative" CHECK ("itinerary_items"."day_index" >= 0),
	CONSTRAINT "itinerary_items_position_non_negative" CHECK ("itinerary_items"."position" >= 0),
	CONSTRAINT "itinerary_items_has_subject" CHECK ("itinerary_items"."activity_id" is not null or "itinerary_items"."place_id" is not null or "itinerary_items"."custom_title" is not null)
);
--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_votes" ADD CONSTRAINT "item_votes_itinerary_item_id_itinerary_items_id_fk" FOREIGN KEY ("itinerary_item_id") REFERENCES "public"."itinerary_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_votes" ADD CONSTRAINT "item_votes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_template_id_itineraries_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."itineraries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_invites_group_id_idx" ON "group_invites" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_members_user_id_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "groups_owner_id_idx" ON "groups" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "item_votes_user_id_idx" ON "item_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "itineraries_owner_id_idx" ON "itineraries" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "itineraries_group_id_idx" ON "itineraries" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "itinerary_items_itinerary_day_position_idx" ON "itinerary_items" USING btree ("itinerary_id","day_index","position");--> statement-breakpoint
ALTER TABLE "user_events" ADD CONSTRAINT "user_events_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE set null ON UPDATE no action;