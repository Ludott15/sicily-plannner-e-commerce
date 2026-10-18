CREATE TABLE "user_consents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"granted" boolean NOT NULL,
	"text_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_consents_kind_valid" CHECK ("user_consents"."kind" in ('profiling', 'location', 'sensitive', 'newsletter', 'cookies_analytics')),
	CONSTRAINT "user_consents_text_version_length" CHECK (char_length("user_consents"."text_version") between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_consents_user_kind_idx" ON "user_consents" USING btree ("user_id","kind","id");
--> statement-breakpoint
alter table "user_consents" enable row level security;--> statement-breakpoint
revoke all on table "user_consents" from anon, authenticated;
