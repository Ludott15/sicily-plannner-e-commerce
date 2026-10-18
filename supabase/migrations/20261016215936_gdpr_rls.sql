-- Passo 8.2: diritti sui dati (GDPR) e chiusura delle lacune di privacy.
--
-- Ordine di applicazione: 1) la migrazione generata da drizzle-kit dallo schema
-- (src/server/db/schema/privacy.ts crea public.user_consents; src/server/db/schema/gamification.ts
-- rende reviews.user_id nullable); 2) questo file. Tutto è CREATE OR REPLACE o idempotente.
--
-- Contenuto:
-- - registro dei consensi (user_consents): immutabile, RLS, grant, record_consent, current_consent;
-- - profilazione condizionata al consenso: trigger su user_events, learn_from_events, revoke_profiling;
-- - export: export_profiling (gli eventi non sono leggibili dai ruoli applicativi);
-- - eliminazione dell'account: delete_my_account (gruppi, recensioni anonimizzate, cascade);
-- - conservazione: apply_retention (chiamata dal cron, solo ruolo postgres);
-- - default del nome pubblico da Google (handle_new_user), vista public_reviews con autore eliminato;
-- - erasure: itinerary_bookings_stamp non riscrive updated_by durante la cancellazione.

----------------------------------------------------------------------------
-- REGISTRO DEI CONSENSI
----------------------------------------------------------------------------

-- Nuova riga a ogni scelta: lo stato attuale è l'ultima riga per (user_id, kind).
-- Immutabile come il ledger; la cancellazione a cascata dell'account è ammessa da prevent_mutation
-- (arriva da un trigger di foreign key, pg_trigger_depth() > 1).
create trigger user_consents_immutable
  before update or delete on public.user_consents
  for each row execute function public.prevent_mutation();

create trigger user_consents_no_truncate
  before truncate on public.user_consents
  for each statement execute function public.prevent_mutation();

alter table public.user_consents enable row level security;

revoke all on table public.user_consents from anon, authenticated;
-- Il proprietario legge le sue righe; la scrittura passa solo da record_consent (SECURITY DEFINER).
grant select (id, user_id, kind, granted, text_version, created_at) on table public.user_consents to authenticated;

create policy user_consents_select_own on public.user_consents
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Migrazione del consenso esistente ai dati sensibili (user_constraints.sensitive_consent_at):
-- chi l'ha già dato riceve una riga 'sensitive' con la versione 'v0-legacy', alla data del consenso.
insert into public.user_consents (user_id, kind, granted, text_version, created_at)
select uc.user_id, 'sensitive', true, 'v0-legacy', uc.sensitive_consent_at
from public.user_constraints uc
where uc.sensitive_consent_at is not null
  and not exists (
    select 1 from public.user_consents c
    where c.user_id = uc.user_id and c.kind = 'sensitive'
  );

-- Stato attuale di un consenso per l'utente della sessione (null se mai chiesto). Invoker: la RLS
-- restituisce solo le righe dell'utente.
create or replace function public.current_consent(p_kind text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select c.granted
  from public.user_consents c
  where c.user_id = (select auth.uid()) and c.kind = p_kind
  order by c.id desc
  limit 1
$$;

revoke all on function public.current_consent(text) from public, anon;
grant execute on function public.current_consent(text) to authenticated;

-- Stato del consenso alla profilazione per un utente qualsiasi. Solo per trigger e cron (ruolo
-- owner): nessun grant ai ruoli applicativi, così non si legge il consenso degli altri.
create or replace function public.profiling_allowed(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select c.granted
     from public.user_consents c
     where c.user_id = p_user_id and c.kind = 'profiling'
     order by c.id desc
     limit 1),
    false)
$$;

revoke all on function public.profiling_allowed(uuid) from public, anon, authenticated;

-- Registra una scelta. Gli ospiti possono dare i consensi a profilazione, posizione e dati
-- sensibili, non alla newsletter. La revoca della profilazione cancella i dati derivati.
create or replace function public.record_consent(p_kind text, p_granted boolean, p_text_version text)
returns public.user_consents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.user_consents;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_kind not in ('profiling', 'location', 'sensitive', 'newsletter', 'cookies_analytics') then
    raise exception 'invalid_consent_kind' using errcode = 'P0001';
  end if;
  if p_granted is null then
    raise exception 'invalid_consent' using errcode = 'P0001';
  end if;
  if p_text_version is null or char_length(p_text_version) not between 1 and 40 then
    raise exception 'invalid_consent_version' using errcode = 'P0001';
  end if;
  if p_kind = 'newsletter' and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) then
    raise exception 'guest_not_allowed' using errcode = 'P0001';
  end if;

  insert into public.user_consents (user_id, kind, granted, text_version)
  values (v_uid, p_kind, p_granted, p_text_version)
  returning * into v_row;

  if p_kind = 'profiling' and not p_granted then
    perform public.revoke_profiling();
  end if;

  return v_row;
end;
$$;

revoke all on function public.record_consent(text, boolean, text) from public, anon;
grant execute on function public.record_consent(text, boolean, text) to authenticated;

----------------------------------------------------------------------------
-- PROFILAZIONE CONDIZIONATA AL CONSENSO
----------------------------------------------------------------------------

-- Ogni scrittura su user_events passa da qui (SQL, server e RLS): senza consenso alla profilazione
-- la riga non si scrive, senza errore. Il click affiliato e la prenotazione restano registrati in
-- affiliate_clicks (contratto), e in user_events solo con il consenso.
create or replace function public.user_events_consent_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.profiling_allowed(new.user_id) then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function public.user_events_consent_guard() from public, anon, authenticated;

create trigger user_events_consent_guard
  before insert on public.user_events
  for each row execute function public.user_events_consent_guard();

-- Revoca della profilazione: cancella gli eventi, azzera i pesi impliciti e il profilo (embedding).
-- Non tocca le preferenze esplicite (onboarding e pagina Preferenze). Chiamata da record_consent.
create or replace function public.revoke_profiling()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from public.user_events where user_id = v_uid;
  update public.preference_weights
  set implicit = 0, updated_at = now()
  where user_id = v_uid and implicit <> 0;
  delete from public.user_taste where user_id = v_uid;
end;
$$;

revoke all on function public.revoke_profiling() from public, anon, authenticated;

-- Dati derivati dalla profilazione per chi non ha il consenso: pesi impliciti e profilo.
-- Gli eventi grezzi già registrati restano fino alla conservazione (18 mesi) e non sono usati.
update public.preference_weights pw
set implicit = 0, updated_at = now()
where pw.implicit <> 0 and not public.profiling_allowed(pw.user_id);

delete from public.user_taste ut
where not public.profiling_allowed(ut.user_id);

-- Eventi della sessione per l'export: user_events non è leggibile dai ruoli applicativi.
create or replace function public.export_profiling()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'type', e.type,
        'activityId', e.activity_id,
        'itineraryId', e.itinerary_id,
        'createdAt', e.created_at
      )
      order by e.id
    ),
    '[]'::jsonb)
  from public.user_events e
  where e.user_id = (select auth.uid())
$$;

revoke all on function public.export_profiling() from public, anon;
grant execute on function public.export_profiling() to authenticated;

-- Apprendimento (cron learn): salta gli utenti senza consenso alla profilazione. I loro eventi
-- non processati vengono comunque segnati come processati, senza effetto sui pesi e sul profilo.
create or replace function public.learn_from_events(p_config jsonb, p_limit integer default 5000)
returns table("users" integer, "events" integer)
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_range real := (p_config->>'range')::real;
  v_decay real := (p_config->>'decay')::real;
  v_strength_max real := (p_config->>'strengthMax')::real;
begin
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
    select distinct b.user_id
    from batch b
    where public.profiling_allowed(b.user_id)
  ),
  batch_deltas as (
    select b.user_id, b.activity_id,
      public.learn_event_delta(p_config, b.type, b.user_id, b.activity_id) as delta
    from batch b
    join batch_users bu on bu.user_id = b.user_id
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

alter function public.learn_from_events(jsonb, integer) owner to postgres;
revoke all on function public.learn_from_events(jsonb, integer) from public;

----------------------------------------------------------------------------
-- ELIMINAZIONE DELL'ACCOUNT
----------------------------------------------------------------------------

-- Il trigger di updated_by (prenotazioni) scrive updated_by con auth.uid(). Un aggiornamento che
-- azzera updated_by (la foreign key set null quando si elimina l'account di chi l'ha fatto) non
-- viene riscritto: l'azzeramento non concede privilegi, quindi nessuna GUC serve.
create or replace function public.itinerary_bookings_stamp()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.updated_by is null and old.updated_by is not null then
    new.updated_at := now();
    return new;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

-- Cancella l'account dell'utente della sessione e tutti i suoi dati. Ordine:
-- 1) gruppi di cui è proprietario: passa al membro più vecchio (transfer_group_ownership), oppure
--    il gruppo vuoto va via con i suoi viaggi di gruppo;
-- 2) autore dei consigli locali: anonimizzato e disattivato; recensioni: restano senza autore
--    (author_deleted nella vista pubblica); click: via anon_id;
-- 3) auth.users: cascade su profili e dati personali; orders e admin_audit_log restano con user
--    null (on delete set null), e il ledger dei punti si cancella per cascade (prevent_mutation
--    ammette solo la cancellazione a cascata).
-- Chiamata con dbAsUser dopo la verifica del codice email (src/server/privacy/erase.ts).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_group record;
  v_heir uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  for v_group in select g.id from public.groups g where g.owner_id = v_uid loop
    select m.user_id into v_heir
    from public.group_members m
    where m.group_id = v_group.id and m.user_id <> v_uid
    order by m.joined_at, m.user_id
    limit 1;

    if v_heir is not null then
      perform public.transfer_group_ownership(v_group.id, v_heir);
    else
      delete from public.itineraries where group_id = v_group.id;
      delete from public.groups where id = v_group.id;
    end if;
  end loop;

  -- Autore di consigli locali (persona o redazione legata al profilo): firma anonima e autore
  -- disattivato. La vista public_local_tips mostra solo gli autori attivi, quindi i consigli spariscono.
  -- kind diventa 'editorial': il check local_tip_authors_person_consent esige il consenso per 'person',
  -- che qui è stato ritirato.
  update public.local_tip_authors
  set display_name = 'Autore eliminato', bio = null, photo_url = null, consent_at = null,
      is_active = false, profile_id = null, kind = 'editorial'
  where profile_id = v_uid;

  update public.reviews set user_id = null where user_id = v_uid;

  -- Il legame dei click con la persona, anche attraverso l'identificativo anonimo del browser.
  update public.affiliate_clicks set anon_id = null where user_id = v_uid;

  delete from auth.users u where u.id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

----------------------------------------------------------------------------
-- CONSERVAZIONE (cron /api/cron/retention, ruolo postgres)
----------------------------------------------------------------------------

-- Soglie in config (src/server/privacy/retention.ts, RETENTION): chatSessionMonths, userEventMonths,
-- affiliateClickMonths, groupInviteDays, searchMissMonths, notificationReadMonths, orderDataYears.
-- Restituisce, per ogni lavoro, le righe cambiate: il cron le registra nel log.
create or replace function public.apply_retention(p_config jsonb)
returns table(job_name text, row_count_out bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n bigint;
  v_chat_cutoff timestamptz;
  v_event_cutoff timestamptz;
  v_click_cutoff timestamptz;
  v_invite_cutoff timestamptz;
  v_search_cutoff timestamptz;
  v_notification_cutoff timestamptz;
  v_order_cutoff timestamptz;
begin
  if p_config is null
    or jsonb_typeof(p_config->'chatSessionMonths') is distinct from 'number'
    or jsonb_typeof(p_config->'userEventMonths') is distinct from 'number'
    or jsonb_typeof(p_config->'affiliateClickMonths') is distinct from 'number'
    or jsonb_typeof(p_config->'groupInviteDays') is distinct from 'number'
    or jsonb_typeof(p_config->'searchMissMonths') is distinct from 'number'
    or jsonb_typeof(p_config->'notificationReadMonths') is distinct from 'number'
    or jsonb_typeof(p_config->'orderDataYears') is distinct from 'number'
  then
    raise exception 'retention_config_invalid' using errcode = 'P0001';
  end if;

  v_chat_cutoff := now() - make_interval(months => (p_config->>'chatSessionMonths')::int);
  v_event_cutoff := now() - make_interval(months => (p_config->>'userEventMonths')::int);
  v_click_cutoff := now() - make_interval(months => (p_config->>'affiliateClickMonths')::int);
  v_invite_cutoff := now() - make_interval(days => (p_config->>'groupInviteDays')::int);
  v_search_cutoff := now() - make_interval(months => (p_config->>'searchMissMonths')::int);
  v_notification_cutoff := now() - make_interval(months => (p_config->>'notificationReadMonths')::int);
  v_order_cutoff := now() - make_interval(years => (p_config->>'orderDataYears')::int);

  -- Chat senza messaggi da troppo tempo (l'attività è l'ultimo messaggio, o la creazione).
  delete from public.chat_sessions s
  where coalesce(
    (select max(m.created_at) from public.chat_messages m where m.session_id = s.id),
    s.created_at) < v_chat_cutoff;
  get diagnostics v_n = row_count;
  job_name := 'chat_sessions'; row_count_out := v_n; return next;

  delete from public.user_events e where e.created_at < v_event_cutoff;
  get diagnostics v_n = row_count;
  job_name := 'user_events'; row_count_out := v_n; return next;

  -- Le statistiche (partner, contesto, date, importi) restano: si tolgono solo i legami con la persona.
  update public.affiliate_clicks c
  set user_id = null, anon_id = null
  where c.created_at < v_click_cutoff and (c.user_id is not null or c.anon_id is not null);
  get diagnostics v_n = row_count;
  job_name := 'affiliate_clicks'; row_count_out := v_n; return next;

  delete from public.group_invites i where i.expires_at < v_invite_cutoff;
  get diagnostics v_n = row_count;
  job_name := 'group_invites'; row_count_out := v_n; return next;

  delete from public.search_misses s where s.last_seen < v_search_cutoff;
  get diagnostics v_n = row_count;
  job_name := 'search_misses'; row_count_out := v_n; return next;

  delete from public.notifications n where n.read_at is not null and n.read_at < v_notification_cutoff;
  get diagnostics v_n = row_count;
  job_name := 'notifications'; row_count_out := v_n; return next;

  -- Ordini: email e indirizzo di spedizione si conservano per il termine fiscale (art. 2220 c.c.,
  -- 10 anni), poi si anonimizzano. Importi, date e stato restano per l'obbligo contabile.
  update public.orders o
  set email = 'anonimizzato@invalid.local', shipping_address = null
  where o.created_at < v_order_cutoff
    and (o.shipping_address is not null or o.email <> 'anonimizzato@invalid.local');
  get diagnostics v_n = row_count;
  job_name := 'orders_personal_data'; row_count_out := v_n; return next;
end;
$$;

revoke all on function public.apply_retention(jsonb) from public, anon, authenticated;

----------------------------------------------------------------------------
-- NOME PUBBLICO DI DEFAULT E RECENSIONI SENZA AUTORE
----------------------------------------------------------------------------

-- Alla registrazione con Google il display_name di default è il solo nome (prima parola di
-- full_name). Gli altri accessi copiano il nome come prima. I profili esistenti non si toccano.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_full_name text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name');
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    case
      when new.raw_app_meta_data ->> 'provider' = 'google'
        then nullif(split_part(btrim(v_full_name), ' ', 1), '')
      else v_full_name
    end,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Le recensioni di un account eliminato restano, senza autore. La colonna author_deleted serve
-- all'interfaccia per mostrare "Utente eliminato".
create or replace view public.public_reviews with (security_barrier = 'true') as
select
  r.id,
  r.activity_id,
  r.rating,
  r.body,
  r.created_at,
  p.display_name,
  p.avatar_url,
  (exists (
    select 1
    from public.points_ledger l
    where l.user_id = r.user_id and l.reason = 'review' and l.ref_id = r.activity_id
  )) as rewarded,
  (r.user_id is null) as author_deleted
from public.reviews r
join public.activities a on a.id = r.activity_id and a.is_active
left join public.profiles p on p.id = r.user_id
where r.hidden_at is null;

alter view public.public_reviews owner to postgres;

-- Eventi di comportamento raccolti prima del registro dei consensi (passo 8.2): nessuno li aveva
-- consentiti, quindi si cancellano. Decisione dell'orchestratore su incarico di Ludovico
-- (2026-10-16): il sito non era ancora in produzione, i dati sono solo di sviluppo e di prova.
delete from public.user_events e
where not public.profiling_allowed(e.user_id);
