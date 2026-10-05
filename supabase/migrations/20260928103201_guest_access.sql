-- Accesso ospite (modifica della milestone 1, docs/spec.md "Accesso, ospiti e browser interni").
-- Un ospite è un utente con sessione anonima: claim is_anonymous = true nel JWT, is_anonymous
-- in auth.users. Può creare e modificare i propri itinerari; non può creare gruppi o entrarci,
-- invitare, votare nei gruppi, recensire, fare check-in né accumulare punti.
-- Nelle policy la condizione è quella della spec:
--   not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false)

-- Gruppi: creazione e ingresso passano da funzioni SECURITY DEFINER.
create or replace function public.create_group(p_name text, p_itinerary_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) then
    raise exception 'guest_not_allowed' using errcode = 'P0001';
  end if;

  if p_itinerary_id is not null then
    perform 1 from public.itineraries
    where id = p_itinerary_id and owner_id = v_uid and group_id is null
    for update;
    if not found then
      raise exception 'itinerary_not_available' using errcode = 'P0001';
    end if;
  end if;

  insert into public.groups (name, owner_id, itinerary_id)
  values (p_name, v_uid, p_itinerary_id)
  returning id into v_group_id;

  if p_itinerary_id is not null then
    update public.itineraries set group_id = v_group_id where id = p_itinerary_id;
  end if;

  return v_group_id;
end;
$$;

create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.group_invites;
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
  if v_invite.status = 'revoked' then
    raise exception 'invite_revoked' using errcode = 'P0001';
  end if;
  if v_invite.status = 'expired' or v_invite.expires_at <= now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;
  if v_invite.uses >= v_invite.max_uses then
    raise exception 'invite_exhausted' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.group_members
    where group_id = v_invite.group_id and user_id = v_uid
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_invite.group_id, v_uid, 'member');

  update public.group_invites set uses = uses + 1 where id = v_invite.id;

  return v_invite.group_id;
end;
$$;

-- Punti: award_points gira anche dal server (ruolo postgres, senza JWT), quindi guarda
-- auth.users e non il claim. Un ospite non accumula punti: nessuna riga, risultato false.
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
  if exists (select 1 from auth.users where id = p_user_id and is_anonymous) then
    return false;
  end if;

  insert into public.points_ledger (user_id, delta, reason, ref_type, ref_id, season)
  values (p_user_id, p_delta, p_reason, p_ref_type, p_ref_id, public.season_for(now()))
  on conflict on constraint points_ledger_user_reason_ref_unique do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

-- Inviti: solo il proprietario del gruppo, e mai un ospite (seconda difesa: un ospite non
-- può possedere un gruppo).
drop policy "group_invites_insert_owner" on public.group_invites;
create policy "group_invites_insert_owner" on public.group_invites
  for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and public.is_group_owner(group_id)
    and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false)
  );

-- Voti: sono dei gruppi, a cui un ospite non partecipa.
drop policy "item_votes_insert_own" on public.item_votes;
create policy "item_votes_insert_own" on public.item_votes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.can_vote_item(itinerary_item_id)
    and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false)
  );

drop policy "item_votes_update_own" on public.item_votes;
create policy "item_votes_update_own" on public.item_votes
  for update to authenticated
  using (user_id = (select auth.uid()) and public.can_vote_item(itinerary_item_id))
  with check (
    user_id = (select auth.uid())
    and public.can_vote_item(itinerary_item_id)
    and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false)
  );

-- Recensioni.
drop policy "reviews_insert_own" on public.reviews;
create policy "reviews_insert_own" on public.reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false)
  );

drop policy "reviews_update_own" on public.reviews;
create policy "reviews_update_own" on public.reviews
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false)
  );

-- Check-in: nessuna policy di inserimento per nessuno (arriveranno con record_check_in nella
-- milestone 9, che dovrà rifiutare gli ospiti); il test pgTAP lo verifica già per gli ospiti.

-- Pulizia: ospiti inattivi da p_days giorni, con i loro dati (le chiavi verso profiles sono
-- on delete cascade; ordini e registro admin restano con set null). Attività = creazione,
-- ultimo accesso, ultimo aggiornamento dell'utente o di una sua sessione (refresh del token).
-- Solo per il cron (ruolo postgres): nessun grant ad anon e authenticated.
create or replace function public.delete_inactive_guests(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  if p_days < 1 then
    raise exception 'invalid_days' using errcode = 'P0001';
  end if;

  delete from auth.users u
  where u.is_anonymous
    and greatest(
      u.created_at,
      u.last_sign_in_at,
      u.updated_at,
      (
        select max(greatest(s.updated_at, s.refreshed_at at time zone 'UTC'))
        from auth.sessions s
        where s.user_id = u.id
      )
    ) < now() - make_interval(days => p_days);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.delete_inactive_guests(integer) from public, anon, authenticated;
