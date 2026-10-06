CREATE TYPE "public"."car_access" AS ENUM('own', 'rental', 'none');--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "diet_friendly" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_constraints" ADD COLUMN "car_access" "car_access";--> statement-breakpoint
ALTER TABLE "user_constraints" ADD COLUMN "arrival_airport" text;--> statement-breakpoint
ALTER TABLE "user_constraints" ADD COLUMN "sensitive_consent_at" timestamp with time zone;--> statement-breakpoint
-- Auto: da has_car (sì/no) a car_access (propria, noleggio, nessuna). has_car si elimina nella
-- migrazione successiva.
update public.user_constraints set car_access = case when has_car then 'own'::public.car_access else 'none'::public.car_access end;--> statement-breakpoint
-- Mobilità ridotta e dieta senza consenso non possono esistere (nessuna interfaccia le ha mai
-- scritte): per sicurezza si azzerano prima del vincolo sul consenso.
update public.user_constraints set reduced_mobility = false, diet = '{}' where sensitive_consent_at is null and (reduced_mobility or diet <> '{}');--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_diet_friendly_valid" CHECK ("activities"."diet_friendly" <@ '{vegetarian,vegan,gluten_free,lactose_free}'::text[]);--> statement-breakpoint
ALTER TABLE "user_constraints" ADD CONSTRAINT "user_constraints_arrival_airport_valid" CHECK ("user_constraints"."arrival_airport" in ('CTA', 'PMO', 'TPS', 'CIY'));--> statement-breakpoint
ALTER TABLE "user_constraints" ADD CONSTRAINT "user_constraints_diet_valid" CHECK ("user_constraints"."diet" <@ '{vegetarian,vegan,gluten_free,lactose_free}'::text[]);--> statement-breakpoint
ALTER TABLE "user_constraints" ADD CONSTRAINT "user_constraints_sensitive_consent" CHECK (("user_constraints"."reduced_mobility" = false and "user_constraints"."diet" = '{}') or "user_constraints"."sensitive_consent_at" is not null);--> statement-breakpoint

-- Preferenze (M4 parte 2): ognuno scrive le proprie, ospite compreso (stesse policy di
-- user_constraints); grant per colonna.
grant insert (car_access, arrival_airport, sensitive_consent_at), update (car_access, arrival_airport, sensitive_consent_at)
  on table public.user_constraints to authenticated;
