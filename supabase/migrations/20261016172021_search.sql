CREATE TABLE "search_misses" (
	"query_norm" text PRIMARY KEY NOT NULL,
	"misses" integer DEFAULT 1 NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_misses_query_norm_length" CHECK (char_length("search_misses"."query_norm") between 2 and 100),
	CONSTRAINT "search_misses_misses_positive" CHECK ("search_misses"."misses" > 0)
);
--> statement-breakpoint
alter table "search_misses" enable row level security;--> statement-breakpoint
revoke all on table "search_misses" from anon, authenticated;
