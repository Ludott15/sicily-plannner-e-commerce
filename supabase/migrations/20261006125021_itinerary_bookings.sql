CREATE TYPE "public"."booking_kind" AS ENUM('activity', 'lodging', 'car', 'flight');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('to_book', 'booked');--> statement-breakpoint
CREATE TABLE "itinerary_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"itinerary_id" uuid NOT NULL,
	"kind" "booking_kind" NOT NULL,
	"activity_id" uuid,
	"partner" "partner",
	"status" "booking_status" DEFAULT 'to_book' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itinerary_bookings_item_unique" UNIQUE NULLS NOT DISTINCT("itinerary_id","kind","activity_id"),
	CONSTRAINT "itinerary_bookings_activity_iff_kind" CHECK (("itinerary_bookings"."kind" = 'activity') = ("itinerary_bookings"."activity_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "travelers" smallint;--> statement-breakpoint
ALTER TABLE "itinerary_bookings" ADD CONSTRAINT "itinerary_bookings_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_bookings" ADD CONSTRAINT "itinerary_bookings_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_bookings" ADD CONSTRAINT "itinerary_bookings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_travelers_range" CHECK ("itineraries"."travelers" between 1 and 30);--> statement-breakpoint

-- Builder (M5): chi crea il proprio itinerario sceglie quante persone viaggiano e, copiando un
-- itinerario pronto, eredita i titoli dei giorni, che poi può cambiare.
grant insert (travelers, day_titles) on table public.itineraries to authenticated;
grant update (travelers, day_titles) on table public.itineraries to authenticated;

-- Checklist "Da prenotare": chi può vedere l'itinerario vede la checklist, chi può
-- modificarlo segna lo stato (ospiti compresi, sui propri itinerari). Mai sugli itinerari
-- pronti. Dal client si cambia solo lo stato; updated_by e updated_at li scrive il trigger.
alter table public.itinerary_bookings enable row level security;
revoke all on table public.itinerary_bookings from anon, authenticated;
grant select on table public.itinerary_bookings to authenticated;
grant insert (itinerary_id, kind, activity_id, status) on table public.itinerary_bookings to authenticated;
grant update (status) on table public.itinerary_bookings to authenticated;
grant delete on table public.itinerary_bookings to authenticated;

create policy itinerary_bookings_select on public.itinerary_bookings
  for select to authenticated
  using (public.can_access_itinerary(itinerary_id));

create policy itinerary_bookings_insert on public.itinerary_bookings
  for insert to authenticated
  with check (
    public.can_edit_itinerary(itinerary_id)
    and exists (select 1 from public.itineraries i where i.id = itinerary_id and not i.is_template)
  );

create policy itinerary_bookings_update on public.itinerary_bookings
  for update to authenticated
  using (public.can_edit_itinerary(itinerary_id))
  with check (public.can_edit_itinerary(itinerary_id));

create policy itinerary_bookings_delete on public.itinerary_bookings
  for delete to authenticated
  using (public.can_edit_itinerary(itinerary_id));

create function public.itinerary_bookings_stamp()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger itinerary_bookings_stamp
  before insert or update on public.itinerary_bookings
  for each row execute function public.itinerary_bookings_stamp();