-- Passo 3.3: conversioni affiliate (affiliate_conversions).
-- Questo file sostituisce il SQL che drizzle-kit genererebbe per la stessa modifica: una
-- ADD COLUMN ... NOT NULL senza default fallisce se la tabella ha già righe. Qui le colonne
-- nuove nascono nullable, si riempiono, poi diventano NOT NULL.
-- Le colonne e i vincoli sono anche in src/server/db/schema/affiliates.ts (stesso nome).
-- La RLS non cambia: la tabella ha già RLS, select solo admin, nessuna scrittura dal client.
-- Il grant di select su tabella (authenticated) copre le colonne nuove.
-- Nessun dato di denaro viene riscritto: uno stato fuori dall'elenco fa fallire il check.

ALTER TABLE "affiliate_conversions" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "affiliate_conversions" ADD COLUMN "currency" char(3) DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliate_conversions" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "affiliate_conversions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

-- Righe esistenti (attese: nessuna): id come identificatore esterno, origine csv.
UPDATE "affiliate_conversions" SET "external_id" = "id"::text WHERE "external_id" IS NULL;--> statement-breakpoint
UPDATE "affiliate_conversions" SET "source" = 'csv' WHERE "source" IS NULL;--> statement-breakpoint

ALTER TABLE "affiliate_conversions" ALTER COLUMN "external_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliate_conversions" ALTER COLUMN "source" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "affiliate_conversions" ADD CONSTRAINT "affiliate_conversions_partner_external_id_key" UNIQUE ("partner", "external_id");--> statement-breakpoint
ALTER TABLE "affiliate_conversions" ADD CONSTRAINT "affiliate_conversions_status_valid" CHECK ("affiliate_conversions"."status" in ('pending', 'approved', 'cancelled', 'paid'));--> statement-breakpoint
ALTER TABLE "affiliate_conversions" ADD CONSTRAINT "affiliate_conversions_source_valid" CHECK ("affiliate_conversions"."source" in ('csv', 'api'));--> statement-breakpoint
ALTER TABLE "affiliate_conversions" ADD CONSTRAINT "affiliate_conversions_external_id_length" CHECK (char_length("affiliate_conversions"."external_id") between 1 and 120);
