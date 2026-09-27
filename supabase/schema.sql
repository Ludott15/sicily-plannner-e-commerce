


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."event_type" AS ENUM (
    'view',
    'save',
    'unsave',
    'add_to_itinerary',
    'remove_from_itinerary',
    'affiliate_click',
    'vote_up',
    'vote_down',
    'review'
);


ALTER TYPE "public"."event_type" OWNER TO "postgres";


CREATE TYPE "public"."partner" AS ENUM (
    'travelpayouts',
    'getyourguide',
    'viator',
    'car_rental',
    'internal'
);


ALTER TYPE "public"."partner" OWNER TO "postgres";


CREATE TYPE "public"."travel_party" AS ENUM (
    'solo',
    'couple',
    'family',
    'friends'
);


ALTER TYPE "public"."travel_party" OWNER TO "postgres";


CREATE TYPE "public"."trip_pace" AS ENUM (
    'relaxed',
    'balanced',
    'intense'
);


ALTER TYPE "public"."trip_pace" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'user',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "place_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "duration_min" integer NOT NULL,
    "price_from_eur" numeric(8,2),
    "requires_car" boolean DEFAULT false NOT NULL,
    "accessible" boolean DEFAULT false NOT NULL,
    "season_months" smallint[] DEFAULT '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[] NOT NULL,
    "partner" "public"."partner" DEFAULT 'internal'::"public"."partner" NOT NULL,
    "partner_product_id" "text",
    "affiliate_url" "text",
    "rating" numeric(2,1),
    "embedding" "extensions"."vector"(1024),
    "is_active" boolean DEFAULT true NOT NULL,
    "synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "activities_duration_positive" CHECK (("duration_min" > 0)),
    CONSTRAINT "activities_price_non_negative" CHECK (("price_from_eur" >= (0)::numeric)),
    CONSTRAINT "activities_rating_range" CHECK ((("rating" >= (0)::numeric) AND ("rating" <= (5)::numeric))),
    CONSTRAINT "activities_season_months_valid" CHECK (("season_months" <@ '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[]))
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_interests" (
    "activity_id" "uuid" NOT NULL,
    "interest_key" "text" NOT NULL,
    "strength" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "activity_interests_strength_range" CHECK ((("strength" >= 1) AND ("strength" <= 3)))
);


ALTER TABLE "public"."activity_interests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interests" (
    "key" "text" NOT NULL,
    "label_it" "text" NOT NULL,
    "label_en" "text" NOT NULL,
    "sort" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."interests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."places" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "province" character(2) NOT NULL,
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "description" "text",
    "cover_image" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "places_lat_range" CHECK ((("lat" >= ('-90'::integer)::double precision) AND ("lat" <= (90)::double precision))),
    CONSTRAINT "places_lng_range" CHECK ((("lng" >= ('-180'::integer)::double precision) AND ("lng" <= (180)::double precision)))
);


ALTER TABLE "public"."places" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."preference_weights" (
    "user_id" "uuid" NOT NULL,
    "interest_key" "text" NOT NULL,
    "explicit" smallint DEFAULT 0 NOT NULL,
    "implicit" real DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "preference_weights_explicit_range" CHECK ((("explicit" >= 0) AND ("explicit" <= 5))),
    CONSTRAINT "preference_weights_implicit_range" CHECK ((("implicit" >= ('-2'::integer)::double precision) AND ("implicit" <= (2)::double precision)))
);


ALTER TABLE "public"."preference_weights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    "locale" "text" DEFAULT 'it'::"text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'user'::"public"."user_role" NOT NULL,
    "home_airport_iata" character(3),
    "pace" "public"."trip_pace",
    "party" "public"."travel_party",
    "onboarding_completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_constraints" (
    "user_id" "uuid" NOT NULL,
    "budget_per_day_eur" integer,
    "has_car" boolean DEFAULT false NOT NULL,
    "reduced_mobility" boolean DEFAULT false NOT NULL,
    "diet" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "max_daily_travel_min" integer,
    "heat_tolerance" smallint,
    "crowd_tolerance" smallint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_constraints_budget_non_negative" CHECK (("budget_per_day_eur" >= 0)),
    CONSTRAINT "user_constraints_crowd_range" CHECK ((("crowd_tolerance" >= 0) AND ("crowd_tolerance" <= 5))),
    CONSTRAINT "user_constraints_heat_range" CHECK ((("heat_tolerance" >= 0) AND ("heat_tolerance" <= 5))),
    CONSTRAINT "user_constraints_travel_positive" CHECK (("max_daily_travel_min" > 0))
);


ALTER TABLE "public"."user_constraints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_events" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "public"."event_type" NOT NULL,
    "activity_id" "uuid",
    "itinerary_id" "uuid",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."user_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."user_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."user_events_id_seq" OWNED BY "public"."user_events"."id";



CREATE TABLE IF NOT EXISTS "public"."user_taste" (
    "user_id" "uuid" NOT NULL,
    "embedding" "extensions"."vector"(1024),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_taste" OWNER TO "postgres";


ALTER TABLE ONLY "public"."user_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_partner_product_unique" UNIQUE ("partner", "partner_product_id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_slug_unique" UNIQUE ("slug");



ALTER TABLE ONLY "public"."activity_interests"
    ADD CONSTRAINT "activity_interests_activity_id_interest_key_pk" PRIMARY KEY ("activity_id", "interest_key");



ALTER TABLE ONLY "public"."interests"
    ADD CONSTRAINT "interests_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_slug_unique" UNIQUE ("slug");



ALTER TABLE ONLY "public"."preference_weights"
    ADD CONSTRAINT "preference_weights_user_id_interest_key_pk" PRIMARY KEY ("user_id", "interest_key");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_constraints"
    ADD CONSTRAINT "user_constraints_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_events"
    ADD CONSTRAINT "user_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_taste"
    ADD CONSTRAINT "user_taste_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "activities_embedding_idx" ON "public"."activities" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops");



CREATE INDEX "activities_is_active_partner_idx" ON "public"."activities" USING "btree" ("is_active", "partner");



CREATE INDEX "activities_place_id_idx" ON "public"."activities" USING "btree" ("place_id");



CREATE INDEX "activity_interests_interest_key_idx" ON "public"."activity_interests" USING "btree" ("interest_key");



CREATE INDEX "user_events_unprocessed_idx" ON "public"."user_events" USING "btree" ("user_id") WHERE ("processed_at" IS NULL);



CREATE INDEX "user_taste_embedding_idx" ON "public"."user_taste" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."activity_interests"
    ADD CONSTRAINT "activity_interests_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_interests"
    ADD CONSTRAINT "activity_interests_interest_key_interests_key_fk" FOREIGN KEY ("interest_key") REFERENCES "public"."interests"("key") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."preference_weights"
    ADD CONSTRAINT "preference_weights_interest_key_interests_key_fk" FOREIGN KEY ("interest_key") REFERENCES "public"."interests"("key") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."preference_weights"
    ADD CONSTRAINT "preference_weights_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_constraints"
    ADD CONSTRAINT "user_constraints_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_events"
    ADD CONSTRAINT "user_events_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_events"
    ADD CONSTRAINT "user_events_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_taste"
    ADD CONSTRAINT "user_taste_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activities_delete_admin" ON "public"."activities" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "activities_insert_admin" ON "public"."activities" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "activities_select_active_anon" ON "public"."activities" FOR SELECT TO "anon" USING ("is_active");



CREATE POLICY "activities_select_active_or_admin" ON "public"."activities" FOR SELECT TO "authenticated" USING (("is_active" OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "activities_update_admin" ON "public"."activities" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."activity_interests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_interests_delete_admin" ON "public"."activity_interests" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "activity_interests_insert_admin" ON "public"."activity_interests" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "activity_interests_select_anon" ON "public"."activity_interests" FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."activities" "a"
  WHERE (("a"."id" = "activity_interests"."activity_id") AND "a"."is_active"))));



CREATE POLICY "activity_interests_select_authenticated" ON "public"."activity_interests" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."activities" "a"
  WHERE (("a"."id" = "activity_interests"."activity_id") AND "a"."is_active")))));



CREATE POLICY "activity_interests_update_admin" ON "public"."activity_interests" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."interests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "interests_delete_admin" ON "public"."interests" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "interests_insert_admin" ON "public"."interests" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "interests_select_all" ON "public"."interests" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "interests_update_admin" ON "public"."interests" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."places" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "places_delete_admin" ON "public"."places" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "places_insert_admin" ON "public"."places" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "places_select_all" ON "public"."places" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "places_update_admin" ON "public"."places" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."preference_weights" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "preference_weights_delete_own" ON "public"."preference_weights" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "preference_weights_insert_own" ON "public"."preference_weights" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "preference_weights_select_own" ON "public"."preference_weights" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "preference_weights_update_own" ON "public"."preference_weights" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_constraints" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_constraints_delete_own" ON "public"."user_constraints" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_constraints_insert_own" ON "public"."user_constraints" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_constraints_select_own" ON "public"."user_constraints" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_constraints_update_own" ON "public"."user_constraints" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_events_insert_own" ON "public"."user_events" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_taste" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_taste_select_own" ON "public"."user_taste" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON TABLE "public"."activities" TO "service_role";
GRANT SELECT ON TABLE "public"."activities" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."activities" TO "authenticated";



GRANT ALL ON TABLE "public"."activity_interests" TO "service_role";
GRANT SELECT ON TABLE "public"."activity_interests" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."activity_interests" TO "authenticated";



GRANT ALL ON TABLE "public"."interests" TO "service_role";
GRANT SELECT ON TABLE "public"."interests" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."interests" TO "authenticated";



GRANT ALL ON TABLE "public"."places" TO "service_role";
GRANT SELECT ON TABLE "public"."places" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."places" TO "authenticated";



GRANT ALL ON TABLE "public"."preference_weights" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."preference_weights" TO "authenticated";



GRANT INSERT("user_id") ON TABLE "public"."preference_weights" TO "authenticated";



GRANT INSERT("interest_key") ON TABLE "public"."preference_weights" TO "authenticated";



GRANT INSERT("explicit"),UPDATE("explicit") ON TABLE "public"."preference_weights" TO "authenticated";



GRANT UPDATE("updated_at") ON TABLE "public"."preference_weights" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("display_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("avatar_url") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("locale") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("home_airport_iata") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("pace") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("party") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("onboarding_completed_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."user_constraints" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("user_id") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("budget_per_day_eur"),UPDATE("budget_per_day_eur") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("has_car"),UPDATE("has_car") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("reduced_mobility"),UPDATE("reduced_mobility") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("diet"),UPDATE("diet") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("max_daily_travel_min"),UPDATE("max_daily_travel_min") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("heat_tolerance"),UPDATE("heat_tolerance") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("crowd_tolerance"),UPDATE("crowd_tolerance") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT ALL ON TABLE "public"."user_events" TO "service_role";



GRANT INSERT("user_id") ON TABLE "public"."user_events" TO "authenticated";



GRANT INSERT("type") ON TABLE "public"."user_events" TO "authenticated";



GRANT INSERT("activity_id") ON TABLE "public"."user_events" TO "authenticated";



GRANT INSERT("itinerary_id") ON TABLE "public"."user_events" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."user_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_taste" TO "service_role";
GRANT SELECT ON TABLE "public"."user_taste" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







