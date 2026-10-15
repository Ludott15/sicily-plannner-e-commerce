CREATE TABLE "season_awards" (
	"season" text NOT NULL,
	"rank" smallint NOT NULL,
	"user_id" uuid,
	"points" integer NOT NULL,
	"prize_status" text DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_awards_season_rank_pk" PRIMARY KEY("season","rank"),
	CONSTRAINT "season_awards_season_format" CHECK ("season_awards"."season" ~ '^[0-9]{4}-(estate|inverno)$'),
	CONSTRAINT "season_awards_rank_range" CHECK ("season_awards"."rank" between 1 and 10),
	CONSTRAINT "season_awards_points_positive" CHECK ("season_awards"."points" > 0),
	CONSTRAINT "season_awards_prize_status_valid" CHECK ("season_awards"."prize_status" in ('pending', 'assigned', 'shipped'))
);
--> statement-breakpoint
ALTER TABLE "season_awards" ADD CONSTRAINT "season_awards_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Passo 5.3: classifiche (stagionale, di gruppo, admin stagioni).
-- SQL non generato da drizzle-kit: va accodato alla migrazione generata dallo schema.
-- La tabella season_awards (colonne, PK, FK, check) è già nello schema Drizzle e NON si ripete qui.

----------------------------------------------------------------------------
-- 1. Vista stagionale sostituita da funzioni (top 50 e posizione propria)
----------------------------------------------------------------------------

-- La vista esponeva a ogni utente autenticato l'intera classifica con avatar e totali.
drop view if exists public.seasonal_leaderboard;

-- Nome pubblico: il nome scelto (display_name) se c'è, altrimenti le iniziali del nome
-- dell'account ("Mario Rossi" -> "M. R."). Mai l'email, mai l'id.
create or replace function public.public_name_for(p_display_name text, p_fallback_name text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_name text := nullif(btrim(p_display_name), '');
  v_words text[];
  v_last text;
begin
  if v_name is not null then
    return v_name;
  end if;

  v_words := regexp_split_to_array(btrim(coalesce(p_fallback_name, '')), '\s+');
  if coalesce(v_words[1], '') = '' then
    return 'Viaggiatore';
  end if;

  if array_length(v_words, 1) = 1 then
    return upper(left(v_words[1], 1)) || '.';
  end if;

  v_last := v_words[array_length(v_words, 1)];
  return upper(left(v_words[1], 1)) || '. ' || upper(left(v_last, 1)) || '.';
end;
$$;

-- Top 50 della stagione (default: quella corrente), senza chi è in opt-out.
-- Restituisce solo posizione, nome pubblico, punti e is_me. Anche gli anonimi la leggono.
create or replace function public.seasonal_leaderboard_top(p_season text default null, p_limit integer default 50)
returns table (rank integer, public_name text, points integer, is_me boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if p_season is not null and p_season !~ '^[0-9]{4}-(estate|inverno)$' then
    raise exception 'invalid_season' using errcode = 'P0001';
  end if;

  return query
  with ranked as (
    select
      t.user_id,
      t.total_points,
      rank() over (order by t.total_points desc)::int as pos
    from public.leaderboard_season_totals t
    join public.profiles p on p.id = t.user_id
    where t.season = coalesce(p_season, public.season_for(now()))
      and not p.leaderboard_opt_out
      and t.total_points > 0
  )
  select
    r.pos,
    public.public_name_for(
      p.display_name,
      coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
    ),
    r.total_points,
    coalesce(r.user_id = (select auth.uid()), false)
  from ranked r
  join public.profiles p on p.id = r.user_id
  join auth.users u on u.id = r.user_id
  order by r.pos, r.user_id
  limit least(greatest(coalesce(p_limit, 50), 1), 50);
end;
$$;

revoke all on function public.seasonal_leaderboard_top(text, integer) from public, anon, authenticated;
grant execute on function public.seasonal_leaderboard_top(text, integer) to anon, authenticated;

-- Posizione dell'utente corrente nella stagione, anche se è in opt-out (non compare agli altri).
-- Rank = 1 + numero di utenti non in opt-out con più punti. Nessuna riga se non ha punti.
create or replace function public.my_seasonal_rank(p_season text default null)
returns table (rank integer, points integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_user uuid := (select auth.uid());
  v_season text := coalesce(p_season, public.season_for(now()));
  v_points integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) then
    raise exception 'guest_not_allowed' using errcode = 'P0001';
  end if;
  if p_season is not null and p_season !~ '^[0-9]{4}-(estate|inverno)$' then
    raise exception 'invalid_season' using errcode = 'P0001';
  end if;

  select t.total_points into v_points
  from public.leaderboard_season_totals t
  where t.season = v_season and t.user_id = v_user;

  if v_points is null or v_points <= 0 then
    return;
  end if;

  return query
  select (1 + count(*))::int, v_points
  from public.leaderboard_season_totals t
  join public.profiles p on p.id = t.user_id
  where t.season = v_season
    and not p.leaderboard_opt_out
    and t.total_points > v_points;
end;
$$;

revoke all on function public.my_seasonal_rank(text) from public, anon, authenticated;
grant execute on function public.my_seasonal_rank(text) to authenticated;

----------------------------------------------------------------------------
-- 2. Classifica di gruppo: solo membri, solo nei giorni del viaggio
----------------------------------------------------------------------------

-- Cambia il tipo di ritorno: va eliminata e ricreata. Non è usata dal client, solo dai test.
drop function if exists public.group_leaderboard(uuid);

-- Punti (esclusi i riscatti) dei membri attuali, nel periodo del viaggio del gruppo:
-- da start_date per days giorni (ora italiana, estremi inclusi). Senza date di viaggio, dalla
-- creazione del gruppo a oggi. Il periodo torna in ogni riga (date in formato YYYY-MM-DD).
create or replace function public.group_leaderboard(gid uuid)
returns table (
  rank integer,
  public_name text,
  points integer,
  is_me boolean,
  period_from date,
  period_to date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_created timestamptz;
  v_start date;
  v_days integer;
  v_from date;
  v_to date;
begin
  if not public.is_group_member(gid) then
    raise exception 'not_group_member' using errcode = 'P0001';
  end if;

  select g.created_at, i.start_date, i.days
    into v_created, v_start, v_days
  from public.groups g
  left join public.itineraries i on i.id = g.itinerary_id
  where g.id = gid;

  if v_start is not null then
    v_from := v_start;
    v_to := v_start + v_days - 1;
  else
    v_from := (v_created at time zone 'Europe/Rome')::date;
    v_to := (now() at time zone 'Europe/Rome')::date;
  end if;

  return query
  with totals as (
    select
      gm.user_id,
      coalesce(sum(l.delta) filter (
        where l.reason not in ('redeem', 'redeem_refund')
          and (
            (v_start is not null and (l.created_at at time zone 'Europe/Rome')::date between v_from and v_to)
            or (v_start is null and l.created_at >= v_created)
          )
      ), 0)::int as total
    from public.group_members gm
    left join public.points_ledger l on l.user_id = gm.user_id
    where gm.group_id = gid
    group by gm.user_id
  ),
  ranked as (
    select t.user_id, t.total, rank() over (order by t.total desc)::int as pos
    from totals t
  )
  select
    r.pos,
    public.public_name_for(
      p.display_name,
      coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
    ),
    r.total,
    r.user_id = (select auth.uid()),
    v_from,
    v_to
  from ranked r
  join public.profiles p on p.id = r.user_id
  join auth.users u on u.id = r.user_id
  order by r.pos, r.user_id;
end;
$$;

revoke all on function public.group_leaderboard(uuid) from public, anon, authenticated;
grant execute on function public.group_leaderboard(uuid) to authenticated;

----------------------------------------------------------------------------
-- 3. Impostazioni della classifica: opt-out e nome pubblico (solo tramite funzioni)
----------------------------------------------------------------------------

-- Il client non scrive più la colonna direttamente: passa dalla funzione, che blocca gli ospiti.
revoke update (leaderboard_opt_out) on table public.profiles from authenticated;

create or replace function public.my_leaderboard_settings()
returns table (opt_out boolean, display_name text, public_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.leaderboard_opt_out,
    p.display_name,
    public.public_name_for(
      p.display_name,
      coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
    )
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = (select auth.uid());
$$;

revoke all on function public.my_leaderboard_settings() from public, anon, authenticated;
grant execute on function public.my_leaderboard_settings() to authenticated;

create or replace function public.set_leaderboard_opt_out(p_opt_out boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) then
    raise exception 'guest_not_allowed' using errcode = 'P0001';
  end if;
  if p_opt_out is null then
    raise exception 'invalid_value' using errcode = 'P0001';
  end if;

  update public.profiles
  set leaderboard_opt_out = p_opt_out
  where id = (select auth.uid());
end;
$$;

revoke all on function public.set_leaderboard_opt_out(boolean) from public, anon, authenticated;
grant execute on function public.set_leaderboard_opt_out(boolean) to authenticated;

-- Nome pubblico: testo vuoto torna al nome dell'account (iniziali). Massimo 40 caratteri.
create or replace function public.set_public_name(p_name text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := nullif(btrim(p_name), '');
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) then
    raise exception 'guest_not_allowed' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_name, '')) > 40 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;

  update public.profiles
  set display_name = v_name
  where id = (select auth.uid());
end;
$$;

revoke all on function public.set_public_name(text) from public, anon, authenticated;
grant execute on function public.set_public_name(text) to authenticated;

----------------------------------------------------------------------------
-- 4. Stagioni chiuse: premi per i primi dieci (season_awards)
----------------------------------------------------------------------------

alter table public.season_awards enable row level security;

revoke all on table public.season_awards from anon, authenticated;
grant select on table public.season_awards to authenticated;

-- Solo l'admin legge i premi dal client. Le scritture passano dal codice server (dbAdmin).
create policy season_awards_select_admin on public.season_awards
  for select to authenticated
  using ((select public.is_admin()));

-- Fotografa i primi dieci non in opt-out della stagione, dal ledger (non dalla vista, che può
-- essere di 15 minuti indietro). Una volta sola: se la stagione ha già premi non riscrive nulla.
-- Il pareggio si spezza per id utente, così i dieci posti sono distinti.
create or replace function public.close_season(p_season text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer;
begin
  if p_season !~ '^[0-9]{4}-(estate|inverno)$' then
    raise exception 'invalid_season' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.season_awards where season = p_season) then
    return 0;
  end if;

  insert into public.season_awards (season, rank, user_id, points)
  with totals as (
    select l.user_id, sum(l.delta)::int as points
    from public.points_ledger l
    where l.season = p_season
      and l.reason not in ('redeem', 'redeem_refund')
    group by l.user_id
    having sum(l.delta) > 0
  ),
  eligible as (
    select
      t.user_id,
      t.points,
      row_number() over (order by t.points desc, t.user_id) as pos
    from totals t
    join public.profiles p on p.id = t.user_id
    where not p.leaderboard_opt_out
  )
  select p_season, e.pos::smallint, e.user_id, e.points
  from eligible e
  where e.pos <= 10
  on conflict (season, rank) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.close_season(text) from public, anon, authenticated;
grant execute on function public.close_season(text) to service_role;

----------------------------------------------------------------------------
-- REFRESH DELLA CLASSIFICA STAGIONALE: ogni 15 minuti con pg_cron (nel database, indipendente
-- dal piano di Vercel). La route /api/cron/refresh-leaderboard resta per un refresh manuale.
----------------------------------------------------------------------------

create extension if not exists pg_cron;

select cron.schedule(
  'refresh-leaderboard',
  '*/15 * * * *',
  $$select public.refresh_leaderboard()$$
);
