CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_it" text NOT NULL,
	"name_en" text NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "areas_slug_unique" UNIQUE("slug"),
	CONSTRAINT "areas_slug_format" CHECK ("areas"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "area_id" uuid;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "places_area_id_idx" ON "places" USING btree ("area_id");--> statement-breakpoint

-- Aree di viaggio (M4 parte 3): catalogo editoriale come interests e places.
-- Lettura pubblica, scrittura solo admin. places.area_id eredita le policy di places.
alter table public.areas enable row level security;
revoke all on table public.areas from anon, authenticated;
grant select on table public.areas to anon, authenticated;
grant insert, update, delete on table public.areas to authenticated;

create policy areas_select_all on public.areas
  for select to anon, authenticated
  using (true);

create policy areas_insert_admin on public.areas
  for insert to authenticated
  with check ((select public.is_admin()));

create policy areas_update_admin on public.areas
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy areas_delete_admin on public.areas
  for delete to authenticated
  using ((select public.is_admin()));

-- Le otto aree iniziali (docs/spec.md, M4 parte 3). Servono anche in produzione: il motore
-- compone i viaggi per area. L'assegnazione dei luoghi la fa l'admin.
insert into public.areas (slug, name_it, name_en, sort) values
  ('palermo', 'Palermo e dintorni', 'Palermo and surroundings', 10),
  ('costa-nord-madonie', 'Costa nord e Madonie', 'North coast and Madonie', 20),
  ('ovest', 'Ovest', 'West', 30),
  ('agrigentino', 'Agrigentino', 'Agrigento area', 40),
  ('interno', 'Interno', 'Inland Sicily', 50),
  ('etna-costa-ionica', 'Etna e costa ionica', 'Etna and Ionian coast', 60),
  ('siracusano', 'Siracusano', 'Syracuse area', 70),
  ('barocco-ibleo', 'Barocco ibleo', 'Hyblaean Baroque', 80)
on conflict (slug) do nothing;