CREATE TABLE "activity_tag_proposals" (
	"activity_id" uuid NOT NULL,
	"interest_key" text NOT NULL,
	"strength" smallint NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_tag_proposals_activity_id_interest_key_pk" PRIMARY KEY("activity_id","interest_key"),
	CONSTRAINT "activity_tag_proposals_strength_range" CHECK ("activity_tag_proposals"."strength" between 1 and 3),
	CONSTRAINT "activity_tag_proposals_model_length" CHECK (char_length("activity_tag_proposals"."model") <= 100)
);
--> statement-breakpoint
CREATE TABLE "partner_import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner" "partner" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"deactivated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	CONSTRAINT "partner_import_runs_partner_not_internal" CHECK ("partner_import_runs"."partner" <> 'internal'),
	CONSTRAINT "partner_import_runs_status_valid" CHECK ("partner_import_runs"."status" in ('ok', 'failed')),
	CONSTRAINT "partner_import_runs_counts_non_negative" CHECK ("partner_import_runs"."created_count" >= 0 and "partner_import_runs"."updated_count" >= 0 and "partner_import_runs"."deactivated_count" >= 0 and "partner_import_runs"."skipped_count" >= 0),
	CONSTRAINT "partner_import_runs_finished_after_start" CHECK ("partner_import_runs"."finished_at" is null or "partner_import_runs"."finished_at" >= "partner_import_runs"."started_at"),
	CONSTRAINT "partner_import_runs_error_length" CHECK (char_length("partner_import_runs"."error") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "embedded_hash" text;--> statement-breakpoint
ALTER TABLE "activity_offers" ADD COLUMN "missed_imports" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_offers" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_tag_proposals" ADD CONSTRAINT "activity_tag_proposals_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_tag_proposals" ADD CONSTRAINT "activity_tag_proposals_interest_key_interests_key_fk" FOREIGN KEY ("interest_key") REFERENCES "public"."interests"("key") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "activity_tag_proposals_interest_key_idx" ON "activity_tag_proposals" USING btree ("interest_key");--> statement-breakpoint
CREATE INDEX "partner_import_runs_partner_started_at_idx" ON "partner_import_runs" USING btree ("partner","started_at");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_embedded_hash_format" CHECK ("activities"."embedded_hash" is null or "activities"."embedded_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "activity_offers" ADD CONSTRAINT "activity_offers_missed_imports_range" CHECK ("activity_offers"."missed_imports" between 0 and 10);--> statement-breakpoint
-- Import dei partner (passo 3.2): RLS e grant delle tabelle partner_import_runs e
-- activity_tag_proposals. activities.embedded_hash resta leggibile come le altre colonne:
-- è l'impronta di contenuti già pubblici (titolo, descrizione, luogo), non un dato riservato.
-- Va in coda alla migrazione generata da Drizzle che crea le tabelle e le colonne nuove.
-- Scrivono solo il cron e le azioni admin, con dbAdmin: nessun grant di scrittura ad anon o authenticated.

----------------------------------------------------------------------------
-- partner_import_runs: log degli import, leggibile solo dall'admin
----------------------------------------------------------------------------
alter table public.partner_import_runs enable row level security;
revoke all on table public.partner_import_runs from anon, authenticated;
grant select on table public.partner_import_runs to authenticated;

create policy partner_import_runs_select_admin on public.partner_import_runs
  for select to authenticated
  using ((select public.is_admin()));

----------------------------------------------------------------------------
-- activity_tag_proposals: tag proposti in attesa di conferma, leggibili solo dall'admin
----------------------------------------------------------------------------
alter table public.activity_tag_proposals enable row level security;
revoke all on table public.activity_tag_proposals from anon, authenticated;
grant select on table public.activity_tag_proposals to authenticated;

create policy activity_tag_proposals_select_admin on public.activity_tag_proposals
  for select to authenticated
  using ((select public.is_admin()));



----------------------------------------------------------------------------
-- activity_offers: missed_imports e last_seen_at non hanno grant di lettura (le colonne
-- concesse in offers_url_private non le elencano): nessuna modifica necessaria.
----------------------------------------------------------------------------
