ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_valid";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_valid" CHECK ("notifications"."kind" in ('proposal_accepted','proposal_rejected','badge_earned'));--> statement-breakpoint

-- Passo 5.2: badge. SQL non generabile da Drizzle (check sui criteri, funzioni, trigger, dati
-- iniziali, estensione del check di notifications.kind). Da accodare alla migrazione generata dallo
-- schema. Tutte le funzioni SECURITY DEFINER fissano search_path = public, pg_temp.
-- Errori di dominio: P0001 con codice snake_case; mancata autenticazione: 42501.
-- Le soglie e le chiavi qui devono coincidere con src/lib/badges.ts (INITIAL_BADGES, schema Zod).

----------------------------------------------------------------------------
-- NOTIFICHE: nuovo tipo badge_earned
----------------------------------------------------------------------------


----------------------------------------------------------------------------
-- CRITERI: validazione del jsonb (usata dal check su badges.criteria)
----------------------------------------------------------------------------

-- Tipi ammessi e loro chiavi; min è un intero da 1 a 999999. Le province sono le nove siciliane.
create or replace function public.badge_criteria_valid(p_criteria jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_ok boolean;
begin
  if jsonb_typeof(p_criteria) is distinct from 'object' then
    return false;
  end if;
  if jsonb_typeof(p_criteria->'min') is distinct from 'number' then
    return false;
  end if;
  if (p_criteria->>'min') !~ '^[1-9][0-9]{0,5}$' then
    return false;
  end if;

  case p_criteria->>'type'
    when 'itineraries_completed', 'points_total' then
      v_ok := (p_criteria - 'type' - 'min') = '{}'::jsonb;
    when 'provinces_checked_in' then
      v_ok := (p_criteria - 'type' - 'min') = '{}'::jsonb
        and (p_criteria->>'min')::integer between 1 and 9;
    when 'group_size' then
      v_ok := (p_criteria - 'type' - 'min') = '{}'::jsonb
        and (p_criteria->>'min')::integer between 2 and 30;
    when 'check_ins_in_province' then
      v_ok := (p_criteria - 'type' - 'min' - 'province') = '{}'::jsonb
        and coalesce(p_criteria->>'province' in ('AG', 'CL', 'CT', 'EN', 'ME', 'PA', 'RG', 'SR', 'TP'), false);
    when 'interest_activities_completed' then
      v_ok := (p_criteria - 'type' - 'min' - 'interest') = '{}'::jsonb
        and coalesce(p_criteria->>'interest' ~ '^[a-z][a-z_]*$', false)
        and char_length(p_criteria->>'interest') <= 40;
    else
      v_ok := false;
  end case;

  return v_ok;
end;
$$;

alter table public.badges add constraint badges_key_format
  check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(key) between 3 and 40);
alter table public.badges add constraint badges_criteria_valid
  check (public.badge_criteria_valid(criteria));

----------------------------------------------------------------------------
-- VALUTAZIONE: valore corrente di un criterio per un utente
----------------------------------------------------------------------------

-- Valore del criterio per l'utente, senza soglia. Solo dalle funzioni SECURITY DEFINER.
create or replace function public.badge_criterion_value(p_user uuid, p_criteria jsonb)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_value integer;
begin
  case p_criteria->>'type'
    when 'itineraries_completed' then
      select count(*)::integer into v_value
      from public.points_ledger l
      where l.user_id = p_user and l.reason = 'itinerary_completed';
    when 'check_ins_in_province' then
      -- Luoghi distinti: lo stesso luogo in giorni diversi non conta due volte.
      select count(distinct c.place_id)::integer into v_value
      from public.check_ins c
      join public.places p on p.id = c.place_id
      where c.user_id = p_user and p.province = p_criteria->>'province';
    when 'provinces_checked_in' then
      select count(distinct p.province)::integer into v_value
      from public.check_ins c
      join public.places p on p.id = c.place_id
      where c.user_id = p_user;
    when 'interest_activities_completed' then
      select count(distinct a.id)::integer into v_value
      from public.itineraries i
      join public.itinerary_items ii on ii.itinerary_id = i.id
      join public.activities a on a.id = ii.activity_id
      join public.activity_interests ai
        on ai.activity_id = a.id and ai.interest_key = p_criteria->>'interest'
      join public.check_ins c
        on c.user_id = p_user
        and c.itinerary_id = i.id
        and c.place_id = coalesce(ii.place_id, a.place_id)
      where i.owner_id = p_user and not i.is_template;
    when 'group_size' then
      select coalesce(max(s.members), 0)::integer into v_value
      from public.groups g
      cross join lateral (
        select count(*)::integer as members
        from public.group_members gm
        where gm.group_id = g.id
      ) s
      where g.owner_id = p_user;
    when 'points_total' then
      select coalesce(sum(l.delta), 0)::integer into v_value
      from public.points_ledger l
      where l.user_id = p_user
        and l.delta > 0
        and l.reason not in ('redeem', 'redeem_refund');
    else
      raise exception 'badge_criteria_unknown' using errcode = 'P0001';
  end case;

  return coalesce(v_value, 0);
end;
$$;

-- Assegna i badge il cui criterio è soddisfatto e non ancora ottenuti; per ognuno nuovo scrive
-- la notifica badge_earned. Restituisce le chiavi assegnate in questa chiamata.
-- Non eseguibile dal client: la chiamano il trigger sul ledger e accept_invite.
create or replace function public.evaluate_badges(p_user uuid)
returns setof text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_badge record;
  v_rows integer;
begin
  if p_user is null then
    return;
  end if;

  for v_badge in
    select b.key, b.name_it, b.name_en, b.criteria
    from public.badges b
    where not exists (
      select 1 from public.user_badges ub
      where ub.user_id = p_user and ub.badge_key = b.key
    )
    order by b.key
  loop
    if public.badge_criterion_value(p_user, v_badge.criteria) >= (v_badge.criteria->>'min')::integer then
      insert into public.user_badges (user_id, badge_key)
      values (p_user, v_badge.key)
      on conflict (user_id, badge_key) do nothing;
      get diagnostics v_rows = row_count;

      if v_rows = 1 then
        insert into public.notifications (user_id, kind, payload)
        values (
          p_user,
          'badge_earned',
          jsonb_build_object('badgeKey', v_badge.key, 'nameIt', v_badge.name_it, 'nameEn', v_badge.name_en)
        );
        return next v_badge.key;
      end if;
    end if;
  end loop;

  return;
end;
$$;

-- Progresso di un utente su ciascun badge non ancora ottenuto: valore corrente (fermo alla soglia)
-- e soglia. Solo per le funzioni SQL; il client usa my_badge_progress().
create or replace function public.badge_progress(p_user uuid)
returns table(badge_key text, current_value integer, target_value integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select
    b.key,
    least(public.badge_criterion_value(p_user, b.criteria), (b.criteria->>'min')::integer),
    (b.criteria->>'min')::integer
  from public.badges b
  where not exists (
    select 1 from public.user_badges ub
    where ub.user_id = p_user and ub.badge_key = b.key
  )
  order by b.key;
end;
$$;

-- Progresso dell'utente che chiama: nessun parametro utente esposto.
create or replace function public.my_badge_progress()
returns table(badge_key text, current_value integer, target_value integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return query select * from public.badge_progress(auth.uid());
end;
$$;

-- Trigger sul ledger: ogni accredito positivo rivaluta i badge dell'utente.
create or replace function public.points_ledger_award_badges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.delta > 0 then
    perform public.evaluate_badges(new.user_id);
  end if;
  return null;
end;
$$;

create trigger points_ledger_award_badges
  after insert on public.points_ledger
  for each row execute function public.points_ledger_award_badges();

revoke all on function public.badge_criterion_value(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.badge_progress(uuid) from public, anon, authenticated;
revoke all on function public.evaluate_badges(uuid) from public, anon, authenticated;
revoke all on function public.points_ledger_award_badges() from public, anon, authenticated;
revoke all on function public.my_badge_progress() from public, anon;
grant execute on function public.my_badge_progress() to authenticated;

----------------------------------------------------------------------------
-- ACCEPT_INVITE: come nel passo 5.1, più la valutazione dei badge dell'owner del gruppo
-- (criterio group_size). Il resto della funzione è invariato.
----------------------------------------------------------------------------

create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.group_invites;
  v_members integer;
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) then
    raise exception 'guest_not_allowed' using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.group_invites
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;
  -- Già membro: si torna al gruppo anche con un invito scaduto, revocato o esaurito (nessun uso contato).
  if exists (
    select 1 from public.group_members
    where group_id = v_invite.group_id and user_id = v_uid
  ) then
    return v_invite.group_id;
  end if;
  if v_invite.status = 'revoked' then
    raise exception 'invite_revoked' using errcode = 'P0001';
  end if;
  if v_invite.status = 'expired' or v_invite.expires_at <= now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;
  if v_invite.uses >= v_invite.max_uses then
    raise exception 'invite_exhausted' using errcode = 'P0001';
  end if;

  perform 1 from public.groups where id = v_invite.group_id for update;
  select count(*)::integer into v_members
  from public.group_members
  where group_id = v_invite.group_id;
  if v_members >= 30 then
    raise exception 'group_full' using errcode = 'P0001';
  end if;

  insert into public.group_members (group_id, user_id, role, invited_by)
  values (v_invite.group_id, v_uid, 'member', v_invite.invited_by);

  update public.group_invites set uses = uses + 1 where id = v_invite.id;

  if v_invite.invited_by <> v_uid and exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.onboarding_completed_at is not null
  ) then
    perform public.award_points(v_invite.invited_by, public.point_delta('invite_accepted'), 'invite_accepted', 'invite', v_uid);
  end if;

  select g.owner_id into v_owner from public.groups g where g.id = v_invite.group_id;
  perform public.evaluate_badges(v_owner);

  return v_invite.group_id;
end;
$$;

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

----------------------------------------------------------------------------
-- DATI INIZIALI: badge della spec (docs/spec.md, sezione Badge)
----------------------------------------------------------------------------

insert into public.badges (key, name_it, name_en, description, criteria) values
  ('primo-viaggio', 'Primo viaggio', 'First trip',
    'Completa il tuo primo itinerario: tre luoghi visitati con il check-in.',
    '{"type": "itineraries_completed", "min": 1}'),
  ('esploratore-etna', 'Esploratore dell''Etna', 'Etna explorer',
    'Fai cinque check-in in luoghi della provincia di Catania.',
    '{"type": "check_ins_in_province", "province": "CT", "min": 5}'),
  ('nove-su-nove', 'Nove su nove', 'Nine out of nine',
    'Fai almeno un check-in in ciascuna delle nove province siciliane.',
    '{"type": "provinces_checked_in", "min": 9}'),
  ('buongustaio', 'Buongustaio', 'Food lover',
    'Completa cinque attività con interesse cibo e vino.',
    '{"type": "interest_activities_completed", "interest": "food_wine", "min": 5}'),
  ('organizzatore', 'Organizzatore', 'Organiser',
    'Crea un gruppo con almeno quattro membri.',
    '{"type": "group_size", "min": 4}')
on conflict (key) do nothing;

----------------------------------------------------------------------------
-- BACKFILL: valuta i badge di chi ha già punti o è owner di un gruppo (una volta, alla migrazione)
----------------------------------------------------------------------------

do $$
declare
  v_user uuid;
begin
  for v_user in
    select l.user_id from public.points_ledger l
    union
    select g.owner_id from public.groups g
  loop
    perform public.evaluate_badges(v_user);
  end loop;
end;
$$;
