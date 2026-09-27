-- Gamification e affiliati: award_points, immutabilità del ledger, classifiche, RLS.

----------------------------------------------------------------------------
-- STAGIONI E PUNTI
----------------------------------------------------------------------------

-- Estate: aprile-settembre. Inverno: ottobre-marzo, etichettato con l'anno in cui inizia
-- (gennaio 2027 appartiene a '2026-inverno'). Calcolo sull'ora italiana.
create or replace function public.season_for(ts timestamptz)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when extract(month from ts at time zone 'Europe/Rome') between 4 and 9
      then extract(year from ts at time zone 'Europe/Rome')::int || '-estate'
    when extract(month from ts at time zone 'Europe/Rome') >= 10
      then extract(year from ts at time zone 'Europe/Rome')::int || '-inverno'
    else (extract(year from ts at time zone 'Europe/Rome')::int - 1) || '-inverno'
  end;
$$;

grant execute on function public.season_for(timestamptz) to anon, authenticated;

-- Unica via di scrittura del ledger. Idempotente: la stessa (utente, motivo, ref_id)
-- accredita una volta sola. Restituisce true se ha accreditato, false se esisteva già.
-- Non eseguibile dal client: la chiamano il codice server (dbAdmin) e altre funzioni
-- SECURITY DEFINER dopo aver verificato le condizioni anti-abuso.
create or replace function public.award_points(
  p_user_id uuid,
  p_delta integer,
  p_reason public.point_reason,
  p_ref_type text,
  p_ref_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer;
begin
  insert into public.points_ledger (user_id, delta, reason, ref_type, ref_id, season)
  values (p_user_id, p_delta, p_reason, p_ref_type, p_ref_id, public.season_for(now()))
  on conflict on constraint points_ledger_user_reason_ref_unique do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.award_points(uuid, integer, public.point_reason, text, uuid)
  from public, anon, authenticated;
grant execute on function public.award_points(uuid, integer, public.point_reason, text, uuid)
  to service_role;

----------------------------------------------------------------------------
-- IMMUTABILITÀ: points_ledger e user_badges
----------------------------------------------------------------------------

-- Nessun update né delete, per nessun ruolo (postgres compreso).
-- Unica eccezione: la cancellazione a cascata quando si elimina l'account
-- (arriva da un trigger di foreign key, quindi pg_trigger_depth() > 1).
create or replace function public.prevent_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception '%_immutable', tg_table_name using errcode = 'P0001';
end;
$$;

create trigger points_ledger_immutable
  before update or delete on public.points_ledger
  for each row execute function public.prevent_mutation();

create trigger points_ledger_no_truncate
  before truncate on public.points_ledger
  for each statement execute function public.prevent_mutation();

create trigger user_badges_immutable
  before update or delete on public.user_badges
  for each row execute function public.prevent_mutation();

create trigger user_badges_no_truncate
  before truncate on public.user_badges
  for each statement execute function public.prevent_mutation();

----------------------------------------------------------------------------
-- RLS
----------------------------------------------------------------------------

alter table public.points_ledger enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.check_ins enable row level security;
alter table public.reviews enable row level security;
alter table public.affiliate_clicks enable row level security;
alter table public.affiliate_conversions enable row level security;

revoke all on table public.points_ledger, public.badges, public.user_badges, public.check_ins,
  public.reviews, public.affiliate_clicks, public.affiliate_conversions
  from anon, authenticated;

-- points_ledger: il proprietario legge il proprio storico; nessuna scrittura dal client
grant select on table public.points_ledger to authenticated;

create policy points_ledger_select_own on public.points_ledger
  for select to authenticated
  using (user_id = (select auth.uid()));

-- badges: catalogo pubblico, scrittura solo admin
grant select on table public.badges to anon, authenticated;
grant insert, update, delete on table public.badges to authenticated;

create policy badges_select_all on public.badges
  for select to anon, authenticated
  using (true);

create policy badges_insert_admin on public.badges
  for insert to authenticated
  with check ((select public.is_admin()));

create policy badges_update_admin on public.badges
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy badges_delete_admin on public.badges
  for delete to authenticated
  using ((select public.is_admin()));

-- user_badges: il proprietario legge i propri; assegnati solo dal server
grant select on table public.user_badges to authenticated;

create policy user_badges_select_own on public.user_badges
  for select to authenticated
  using (user_id = (select auth.uid()));

-- check_ins: il proprietario legge i propri; si registrano solo con la funzione server
-- (distanza entro 300 m, un check-in per luogo al giorno, massimo 5 al giorno)
grant select on table public.check_ins to authenticated;

create policy check_ins_select_own on public.check_ins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- reviews: il proprietario gestisce le proprie; la lettura pubblica passa dalla vista
-- public_reviews, che non espone user_id
grant select, delete on table public.reviews to authenticated;
grant insert (user_id, activity_id, rating, body) on table public.reviews to authenticated;
grant update (rating, body) on table public.reviews to authenticated;

create policy reviews_select_own on public.reviews
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy reviews_insert_own on public.reviews
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy reviews_update_own on public.reviews
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy reviews_delete_own on public.reviews
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- affiliati: lettura solo admin, scrittura solo server (dbAdmin)
grant select on table public.affiliate_clicks, public.affiliate_conversions to authenticated;

create policy affiliate_clicks_select_admin on public.affiliate_clicks
  for select to authenticated
  using ((select public.is_admin()));

create policy affiliate_conversions_select_admin on public.affiliate_conversions
  for select to authenticated
  using ((select public.is_admin()));

-- profiles: l'utente sceglie se comparire nella classifica stagionale
grant update (leaderboard_opt_out) on table public.profiles to authenticated;

----------------------------------------------------------------------------
-- VISTE E CLASSIFICHE
----------------------------------------------------------------------------

-- Recensioni pubbliche delle attività attive, con il nome dell'autore e senza user_id.
create view public.public_reviews
with (security_barrier = true)
as
select r.id, r.activity_id, r.rating, r.body, r.created_at, p.display_name as author_name
from public.reviews r
join public.activities a on a.id = r.activity_id and a.is_active
join public.profiles p on p.id = r.user_id;

revoke all on public.public_reviews from anon, authenticated;
grant select on public.public_reviews to anon, authenticated;

-- Totali per stagione, ricalcolati ogni 15 minuti (refresh_leaderboard dal cron).
-- Contano i punti guadagnati: le conversioni in sconto (redeem, redeem_refund) no.
create materialized view public.leaderboard_season_totals as
select season, user_id, sum(delta)::int as total_points
from public.points_ledger
where reason not in ('redeem', 'redeem_refund')
group by season, user_id;

create unique index leaderboard_season_totals_season_user_idx
  on public.leaderboard_season_totals (season, user_id);

revoke all on public.leaderboard_season_totals from anon, authenticated;

-- Classifica stagionale esposta al client: solo nome, avatar e totale, mai lo storico.
-- is_me permette all'utente di trovare la propria posizione.
create view public.seasonal_leaderboard
with (security_barrier = true)
as
select
  t.season,
  rank() over (partition by t.season order by t.total_points desc)::int as rank,
  p.display_name,
  p.avatar_url,
  t.total_points,
  t.user_id = auth.uid() as is_me
from public.leaderboard_season_totals t
join public.profiles p on p.id = t.user_id
where not p.leaderboard_opt_out and t.total_points > 0;

revoke all on public.seasonal_leaderboard from anon, authenticated;
grant select on public.seasonal_leaderboard to authenticated;

create or replace function public.refresh_leaderboard()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  refresh materialized view concurrently public.leaderboard_season_totals;
$$;

revoke all on function public.refresh_leaderboard() from public, anon, authenticated;
grant execute on function public.refresh_leaderboard() to service_role;

-- Classifica di gruppo: punti guadagnati dai membri attuali nei giorni del viaggio
-- (itinerario del gruppo, da start_date per days giorni, ora italiana).
-- Solo per i membri; senza date di viaggio restituisce zero punti per tutti.
create or replace function public.group_leaderboard(gid uuid)
returns table (
  display_name text,
  avatar_url text,
  total_points integer,
  is_me boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.display_name,
    p.avatar_url,
    coalesce(sum(l.delta) filter (
      where l.reason not in ('redeem', 'redeem_refund')
        and i.start_date is not null
        and (l.created_at at time zone 'Europe/Rome')::date >= i.start_date
        and (l.created_at at time zone 'Europe/Rome')::date < i.start_date + i.days
    ), 0)::int as total_points,
    gm.user_id = auth.uid() as is_me
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  join public.profiles p on p.id = gm.user_id
  left join public.itineraries i on i.id = g.itinerary_id
  left join public.points_ledger l on l.user_id = gm.user_id
  where gm.group_id = gid
    and public.is_group_member(gid)
  group by gm.user_id, p.display_name, p.avatar_url
  order by total_points desc;
$$;

revoke all on function public.group_leaderboard(uuid) from public;
grant execute on function public.group_leaderboard(uuid) to authenticated;
