-- Tratte stradali tra luoghi (mappa degli itinerari): RLS e grant della tabella place_legs.
-- La tabella è definita in src/server/db/schema/place-legs.ts (db:generate la crea).
-- Lettura pubblica (il motore la legge con dbPublic). Nessuna scrittura per anon e authenticated:
-- la scrive il cron route-legs e lo script maps:legs con dbAdmin (src/server/maps/legs.admin.ts).
-- Senza grant di scrittura e senza policy di scrittura, un client che tenta di scrivere riceve 42501.

alter table public.place_legs enable row level security;
revoke all on table public.place_legs from anon, authenticated;
grant select (from_place_id, to_place_id, distance_m, duration_s, geometry, source, computed_at)
  on table public.place_legs to anon, authenticated;

create policy place_legs_select_all on public.place_legs
  for select to anon, authenticated
  using (true);
