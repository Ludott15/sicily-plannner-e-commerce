-- Import CSV del catalogo: RLS di activity_sources, luoghi attivabili, vincoli tra luoghi e
-- attività attive, visibilità delle copertine (media_is_public).
-- Va dopo la migrazione generata da Drizzle che crea activity_sources e le colonne nuove.

----------------------------------------------------------------------------
-- activity_sources: fonte e note interne, solo admin
----------------------------------------------------------------------------
alter table public.activity_sources enable row level security;
revoke all on table public.activity_sources from anon, authenticated;

grant select (activity_id, source_url, notes, updated_at, created_at)
  on table public.activity_sources to authenticated;
grant insert (activity_id, source_url, notes)
  on table public.activity_sources to authenticated;
grant update (source_url, notes, updated_at)
  on table public.activity_sources to authenticated;
grant delete on table public.activity_sources to authenticated;

create policy activity_sources_select_admin on public.activity_sources
  for select to authenticated
  using ((select public.is_admin()));

create policy activity_sources_insert_admin on public.activity_sources
  for insert to authenticated
  with check ((select public.is_admin()));

create policy activity_sources_update_admin on public.activity_sources
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy activity_sources_delete_admin on public.activity_sources
  for delete to authenticated
  using ((select public.is_admin()));

----------------------------------------------------------------------------
-- places: i luoghi inattivi li vede solo l'admin
----------------------------------------------------------------------------
drop policy places_select_all on public.places;

create policy places_select_active_anon on public.places
  for select to anon
  using (is_active);

create policy places_select_active_or_admin on public.places
  for select to authenticated
  using (is_active or (select public.is_admin()));

----------------------------------------------------------------------------
-- Vincoli tra luoghi e attività attive (constraint trigger differiti, errcode P0001)
----------------------------------------------------------------------------
-- Un'attività attiva non può stare in un luogo inattivo. Controlla lo stato al momento del
-- commit (o di "set constraints ... immediate"), quindi rilegge attività e luogo.
create or replace function public.check_activity_place_active()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.activities a
    join public.places p on p.id = a.place_id
    where a.id = new.id
      and a.is_active
      and not p.is_active
  ) then
    raise exception 'activity_place_inactive' using errcode = 'P0001';
  end if;

  return null;
end;
$$;

revoke all on function public.check_activity_place_active() from public, anon, authenticated;

create constraint trigger activity_place_inactive
  after insert or update of is_active, place_id on public.activities
  deferrable initially deferred
  for each row
  when (new.is_active)
  execute function public.check_activity_place_active();

-- Un luogo non si disattiva finché ha attività attive.
create or replace function public.check_place_has_active_activities()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.places p
    join public.activities a on a.place_id = p.id
    where p.id = new.id
      and not p.is_active
      and a.is_active
  ) then
    raise exception 'place_has_active_activities' using errcode = 'P0001';
  end if;

  return null;
end;
$$;

revoke all on function public.check_place_has_active_activities() from public, anon, authenticated;

create constraint trigger place_has_active_activities
  after update of is_active on public.places
  deferrable initially deferred
  for each row
  when (not new.is_active)
  execute function public.check_place_has_active_activities();

----------------------------------------------------------------------------
-- media_is_public: un luogo inattivo non rende pubblica la sua copertina
----------------------------------------------------------------------------
-- Stessa definizione della migrazione 20261006141804 (firma, security definer, search_path,
-- grant); cambia solo il ramo dei luoghi, che richiede is_active.
create or replace function public.media_is_public(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.media_is_usable(p_media_id) and (
    exists (select 1 from public.places where cover_media_id = p_media_id and is_active)
    or exists (select 1 from public.areas where cover_media_id = p_media_id)
    or exists (select 1 from public.activities where cover_media_id = p_media_id and is_active)
    or exists (
      select 1 from public.itineraries
      where cover_media_id = p_media_id and is_template and slug is not null
    )
  );
$$;

revoke all on function public.media_is_public(uuid) from public;
grant execute on function public.media_is_public(uuid) to anon, authenticated;
