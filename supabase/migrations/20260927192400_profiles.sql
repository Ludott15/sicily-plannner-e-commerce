CREATE TYPE "public"."travel_party" AS ENUM('solo', 'couple', 'family', 'friends');--> statement-breakpoint
CREATE TYPE "public"."trip_pace" AS ENUM('relaxed', 'balanced', 'intense');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"locale" text DEFAULT 'it' NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"home_airport_iata" char(3),
	"pace" "trip_pace",
	"party" "travel_party",
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;