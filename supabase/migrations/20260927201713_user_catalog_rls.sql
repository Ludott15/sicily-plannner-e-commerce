-- RLS per le tabelle utente e catalogo.
-- Schema: prima si revocano i grant di default di Supabase, poi si concede il minimo
-- per colonna; le policy filtrano le righe. auth.uid() e is_admin() sempre in (select ...).

----------------------------------------------------------------------------
-- CATALOGO: lettura pubblica (attività e tag solo se attive), scrittura solo admin
----------------------------------------------------------------------------

alter table public.interests enable row level security;
alter table public.places enable row level security;
alter table public.activities enable row level security;
alter table public.activity_interests enable row level security;

revoke all on table public.interests, public.places, public.activities, public.activity_interests
  from anon, authenticated;
grant select on table public.interests, public.places, public.activities, public.activity_interests
  to anon, authenticated;
grant insert, update, delete on table public.interests, public.places, public.activities, public.activity_interests
  to authenticated;

-- interests
create policy interests_select_all on public.interests
  for select to anon, authenticated
  using (true);

create policy interests_insert_admin on public.interests
  for insert to authenticated
  with check ((select public.is_admin()));

create policy interests_update_admin on public.interests
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy interests_delete_admin on public.interests
  for delete to authenticated
  using ((select public.is_admin()));

-- places
create policy places_select_all on public.places
  for select to anon, authenticated
  using (true);

create policy places_insert_admin on public.places
  for insert to authenticated
  with check ((select public.is_admin()));

create policy places_update_admin on public.places
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy places_delete_admin on public.places
  for delete to authenticated
  using ((select public.is_admin()));

-- activities: le inattive (import da approvare, disattivate) le vede solo l'admin
create policy activities_select_active_anon on public.activities
  for select to anon
  using (is_active);

create policy activities_select_active_or_admin on public.activities
  for select to authenticated
  using (is_active or (select public.is_admin()));

create policy activities_insert_admin on public.activities
  for insert to authenticated
  with check ((select public.is_admin()));

create policy activities_update_admin on public.activities
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy activities_delete_admin on public.activities
  for delete to authenticated
  using ((select public.is_admin()));

-- activity_interests: visibili se l'attività è visibile al chiamante
create policy activity_interests_select_anon on public.activity_interests
  for select to anon
  using (exists (
    select 1 from public.activities a
    where a.id = activity_id and a.is_active
  ));

create policy activity_interests_select_authenticated on public.activity_interests
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.activities a
      where a.id = activity_id and a.is_active
    )
  );

create policy activity_interests_insert_admin on public.activity_interests
  for insert to authenticated
  with check ((select public.is_admin()));

create policy activity_interests_update_admin on public.activity_interests
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy activity_interests_delete_admin on public.activity_interests
  for delete to authenticated
  using ((select public.is_admin()));

----------------------------------------------------------------------------
-- DATI DELL'UTENTE: solo il proprietario
----------------------------------------------------------------------------

alter table public.user_constraints enable row level security;
alter table public.preference_weights enable row level security;
alter table public.user_taste enable row level security;
alter table public.user_events enable row level security;

revoke all on table public.user_constraints, public.preference_weights, public.user_taste, public.user_events
  from anon, authenticated;

-- user_constraints: il proprietario legge e scrive tutto tranne created_at
grant select, delete on table public.user_constraints to authenticated;
grant insert (user_id, budget_per_day_eur, has_car, reduced_mobility, diet, max_daily_travel_min, heat_tolerance, crowd_tolerance)
  on table public.user_constraints to authenticated;
grant update (budget_per_day_eur, has_car, reduced_mobility, diet, max_daily_travel_min, heat_tolerance, crowd_tolerance)
  on table public.user_constraints to authenticated;

create policy user_constraints_select_own on public.user_constraints
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_constraints_insert_own on public.user_constraints
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy user_constraints_update_own on public.user_constraints
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy user_constraints_delete_own on public.user_constraints
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- preference_weights: il proprietario scrive solo explicit; implicit lo aggiorna il cron (dbAdmin)
grant select, delete on table public.preference_weights to authenticated;
grant insert (user_id, interest_key, explicit) on table public.preference_weights to authenticated;
grant update (explicit, updated_at) on table public.preference_weights to authenticated;

create policy preference_weights_select_own on public.preference_weights
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy preference_weights_insert_own on public.preference_weights
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy preference_weights_update_own on public.preference_weights
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy preference_weights_delete_own on public.preference_weights
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- user_taste: calcolato dal cron; il proprietario può solo leggerlo
grant select on table public.user_taste to authenticated;

create policy user_taste_select_own on public.user_taste
  for select to authenticated
  using (user_id = (select auth.uid()));

-- user_events: il proprietario registra i propri eventi ma non li rilegge;
-- processed_at lo imposta solo il cron
grant insert (user_id, type, activity_id, itinerary_id) on table public.user_events to authenticated;
grant usage on sequence public.user_events_id_seq to authenticated;

create policy user_events_insert_own on public.user_events
  for insert to authenticated
  with check (user_id = (select auth.uid()));
