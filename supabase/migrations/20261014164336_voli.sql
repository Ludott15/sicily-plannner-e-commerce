ALTER TYPE "public"."event_type" ADD VALUE 'flight_search';--> statement-breakpoint
ALTER TABLE "user_constraints" DROP CONSTRAINT "user_constraints_arrival_airport_valid";--> statement-breakpoint
ALTER TABLE "user_constraints" ADD CONSTRAINT "user_constraints_arrival_airport_valid" CHECK ("user_constraints"."arrival_airport" in ('CTA', 'PMO', 'TPS', 'CIY', 'LMP', 'PNL'));