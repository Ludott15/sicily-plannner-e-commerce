ALTER TABLE "user_constraints" ADD COLUMN "trip_days" smallint;--> statement-breakpoint
ALTER TABLE "user_constraints" ADD COLUMN "trip_months" smallint[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_constraints" ADD CONSTRAINT "user_constraints_trip_days_range" CHECK ("user_constraints"."trip_days" between 1 and 14);--> statement-breakpoint
ALTER TABLE "user_constraints" ADD CONSTRAINT "user_constraints_trip_months_valid" CHECK ("user_constraints"."trip_months" <@ '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[]);--> statement-breakpoint

-- Onboarding: l'utente (anche ospite) scrive i suoi giorni e mesi di viaggio. Stesse policy
-- di user_constraints (solo le proprie righe); grant per colonna.
grant insert (trip_days, trip_months), update (trip_days, trip_months) on table public.user_constraints to authenticated;
