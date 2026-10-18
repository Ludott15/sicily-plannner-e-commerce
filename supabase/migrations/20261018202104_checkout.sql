CREATE TABLE "checkout_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"stripe_session_id" text,
	"user_id" uuid,
	"cart" jsonb NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"shipping_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"points_redeemed" integer DEFAULT 0 NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "checkout_sessions_stripe_session_id_unique" UNIQUE("stripe_session_id"),
	CONSTRAINT "checkout_sessions_status_valid" CHECK ("checkout_sessions"."status" in ('open','completed','expired','failed')),
	CONSTRAINT "checkout_sessions_stripe_id_format" CHECK ("checkout_sessions"."stripe_session_id" is null or "checkout_sessions"."stripe_session_id" ~ '^cs_[A-Za-z0-9_]+$'),
	CONSTRAINT "checkout_sessions_cart_is_array" CHECK (jsonb_typeof("checkout_sessions"."cart") = 'array'),
	CONSTRAINT "checkout_sessions_token_hash_format" CHECK ("checkout_sessions"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "checkout_sessions_amounts_non_negative" CHECK ("checkout_sessions"."subtotal_cents" >= 0 and "checkout_sessions"."shipping_cents" >= 0 and "checkout_sessions"."discount_cents" >= 0 and "checkout_sessions"."points_redeemed" >= 0),
	CONSTRAINT "checkout_sessions_discount_max_15_percent" CHECK ("checkout_sessions"."discount_cents" * 100 <= "checkout_sessions"."subtotal_cents" * 15),
	CONSTRAINT "checkout_sessions_discount_whole_euros" CHECK ("checkout_sessions"."discount_cents" % 100 = 0)
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkout_sessions_user_id_idx" ON "checkout_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "checkout_sessions_status_idx" ON "checkout_sessions" USING btree ("status");
--> statement-breakpoint
alter table "checkout_sessions" enable row level security;--> statement-breakpoint
revoke all on table "checkout_sessions" from anon, authenticated;
--> statement-breakpoint
alter table "stripe_events" enable row level security;--> statement-breakpoint
revoke all on table "stripe_events" from anon, authenticated;
