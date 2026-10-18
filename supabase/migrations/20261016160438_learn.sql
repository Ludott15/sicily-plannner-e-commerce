-- Apprendimento e analisi (M11, docs/spec.md "Passo 4, apprendimento").
-- Il cron notturno (src/server/personalization/learn.admin.ts) chiama learn_from_events con
-- dbAdmin (ruolo postgres). Le costanti (variazioni, decadimento, limiti) arrivano dal jsonb
-- p_config, costruito da LEARNING_PARAMS in src/server/personalization/config.ts: unica fonte.

-- Conteggio dei propri eventi (similarità, attiva da 5 eventi). user_events non è leggibile dai
-- ruoli applicativi (privacy, user_data_rls): la funzione conta solo le righe di chi la chiama.
create or replace function public.my_event_count()
returns int
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return 0;
  end if;
  return (select count(*)::int from public.user_events e where e.user_id = v_uid);
end;
$$;

revoke all on function public.my_event_count() from public, anon;
grant execute on function public.my_event_count() to authenticated;

-- Variazione di implicit portata da un evento. Recensione: (voto - base) × scala, con il voto
-- dell'utente su quell'attività (0 se manca). Altri tipi: la tabella delle variazioni; tipi senza
-- voce (flight_search, unsave) valgono 0.
create or replace function public.learn_event_delta(
  p_config jsonb,
  p_type public.event_type,
  p_user_id uuid,
  p_activity_id uuid
) returns real
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  select case
    when p_type = 'review' then coalesce(
      (select (r.rating - (p_config->>'reviewBase')::real) * (p_config->>'reviewScale')::real
       from public.reviews r
       where r.user_id = p_user_id and r.activity_id = p_activity_id),
      0::real)
    else coalesce((p_config->'deltas'->>(p_type::text))::real, 0::real)
  end
$$;

-- Cron: prende fino a p_limit eventi non processati (i più vecchi prima) e, per ogni utente coinvolto:
-- 1. decade del decadimento tutti i suoi implicit (una volta per esecuzione, solo se ha eventi nuovi);
-- 2. somma, per ogni interesse dell'attività, variazione × forza / strengthMax;
-- 3. limita il risultato a ±range e scrive preference_weights (righe nuove con explicit 0);
-- 4. ricalcola user_taste.embedding come media (avg) degli embedding delle attività con
--    interazioni positive (variazione > 0) negli ultimi tasteWindowDays giorni;
-- 5. segna gli eventi come processati.
-- Restituisce gli utenti toccati e gli eventi processati. Rieseguirla senza eventi nuovi non cambia nulla.
create or replace function public.learn_from_events(
  p_config jsonb,
  p_limit int default 5000
) returns table (users int, events int)
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_range real := (p_config->>'range')::real;
  v_decay real := (p_config->>'decay')::real;
  v_strength_max real := (p_config->>'strengthMax')::real;
begin
  -- Una sola esecuzione alla volta: due esecuzioni sovrapposte (cron e lancio manuale) leggerebbero
  -- gli stessi eventi e una delle due variazioni andrebbe persa. Il lock dura fino alla fine della
  -- transazione; la seconda esce senza toccare nulla.
  if not pg_try_advisory_xact_lock(hashtext('learn_from_events')) then
    return query select 0, 0;
    return;
  end if;

  if p_config is null or p_limit is null or p_limit < 1 then
    raise exception 'learn_config_invalid' using errcode = 'P0001';
  end if;

  return query
  with batch as (
    select e.id, e.user_id, e.type, e.activity_id
    from public.user_events e
    where e.processed_at is null
    order by e.id
    limit p_limit
  ),
  batch_users as (
    select distinct b.user_id from batch b
  ),
  batch_deltas as (
    select b.user_id, b.activity_id,
      public.learn_event_delta(p_config, b.type, b.user_id, b.activity_id) as delta
    from batch b
    where b.activity_id is not null
  ),
  changes as (
    select d.user_id, ai.interest_key,
      sum(d.delta * ai.strength::real / v_strength_max)::real as change
    from batch_deltas d
    join public.activity_interests ai on ai.activity_id = d.activity_id
    group by d.user_id, ai.interest_key
  ),
  decayed as (
    select pw.user_id, pw.interest_key, (pw.implicit * (1 - v_decay))::real as implicit
    from public.preference_weights pw
    where pw.user_id in (select user_id from batch_users)
  ),
  targets as (
    select x.user_id, x.interest_key from decayed x
    union
    select y.user_id, y.interest_key from changes y
  ),
  written as (
    insert into public.preference_weights (user_id, interest_key, explicit, implicit, updated_at)
    select t.user_id, t.interest_key, 0,
      greatest(-v_range, least(v_range, (coalesce(d.implicit, 0) + coalesce(c.change, 0))::real)),
      now()
    from targets t
    left join decayed d on d.user_id = t.user_id and d.interest_key = t.interest_key
    left join changes c on c.user_id = t.user_id and c.interest_key = t.interest_key
    on conflict (user_id, interest_key) do update
      set implicit = excluded.implicit, updated_at = excluded.updated_at
    returning 1
  ),
  positive as (
    select distinct e.user_id, e.activity_id
    from public.user_events e
    where e.user_id in (select user_id from batch_users)
      and e.activity_id is not null
      and e.created_at >= now() - make_interval(days => (p_config->>'tasteWindowDays')::int)
      and public.learn_event_delta(p_config, e.type, e.user_id, e.activity_id) > 0
  ),
  taste as (
    select p.user_id, avg(a.embedding) as embedding
    from positive p
    join public.activities a on a.id = p.activity_id
    where a.embedding is not null
    group by p.user_id
  ),
  taste_written as (
    insert into public.user_taste (user_id, embedding, updated_at)
    select u.user_id, t.embedding, now()
    from batch_users u
    left join taste t on t.user_id = u.user_id
    on conflict (user_id) do update
      set embedding = excluded.embedding, updated_at = excluded.updated_at
    returning 1
  ),
  marked as (
    update public.user_events e
    set processed_at = now()
    from batch b
    where e.id = b.id
    returning e.id
  )
  select
    (select count(*)::int from batch_users),
    (select count(*)::int from marked);
end;
$$;

-- Solo il cron (ruolo postgres) le chiama: nessun ruolo applicativo le esegue.
revoke all on function public.learn_event_delta(jsonb, public.event_type, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.learn_from_events(jsonb, int) from public, anon, authenticated, service_role;
