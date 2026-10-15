ALTER TABLE "group_members" ADD COLUMN "invited_by" uuid;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Passo 4.1, gruppi: inviti, uscita e rimozione dei membri (docs/spec.md "Gruppi, inviti e voti").
-- Accodato alla parte generata da Drizzle (colonna group_members.invited_by)
-- nella stessa migrazione.
-- Tutte le funzioni SECURITY DEFINER fissano search_path = public, pg_temp.
-- Errori di dominio: SQLSTATE P0001 con messaggio stabile; mancata autenticazione: 42501.

-- Ingresso con invito. Ordine dei controlli: autenticazione, ospite, token (non trovato), già membro
-- (torna al gruppo, nessun uso contato), revocato, scaduto, esaurito, gruppo pieno (30 membri, owner incluso).
-- Il gruppo è bloccato per serializzare due ingressi insieme; invited_by è l'autore dell'invito.
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

  return v_invite.group_id;
end;
$$;

-- Stato di un invito per la pagina /invito/[token], senza dati: active, expired, revoked,
-- exhausted, not_found. Anche senza account: il token è il segreto.
create or replace function public.invite_link_status(p_token text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_invite public.group_invites;
begin
  select * into v_invite
  from public.group_invites
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  if not found then
    return 'not_found';
  end if;
  if v_invite.status = 'revoked' then
    return 'revoked';
  end if;
  if v_invite.status = 'expired' or v_invite.expires_at <= now() then
    return 'expired';
  end if;
  if v_invite.uses >= v_invite.max_uses then
    return 'exhausted';
  end if;
  return 'active';
end;
$$;

-- Fino a 6 tappe distinte dell'itinerario del gruppo, in ordine di giorno e posizione, solo se
-- l'invito è attivo. Il nome è quello che la pagina del viaggio mostra (attività, poi voce
-- libera, poi luogo). Nessun dato personale.
create or replace function public.invite_preview_stops(p_token text)
returns table (place_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select picked.name
  from (
    select distinct on (stops.name)
      stops.name as name,
      stops.day_index as day_index,
      stops.position as position
    from (
      select coalesce(a.title, ii.custom_title, pl.name) as name,
        ii.day_index as day_index,
        ii.position as position
      from public.group_invites gi
      join public.groups g on g.id = gi.group_id
      join public.itinerary_items ii on ii.itinerary_id = g.itinerary_id
      left join public.activities a on a.id = ii.activity_id
      left join public.places pl on pl.id = coalesce(ii.place_id, a.place_id)
      where gi.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
        and gi.status = 'active'
        and gi.expires_at > now()
        and gi.uses < gi.max_uses
    ) as stops
    where stops.name is not null
    order by stops.name, stops.day_index, stops.position
  ) as picked
  order by picked.day_index, picked.position
  limit 6;
$$;

-- Il membro esce dal gruppo. Il proprietario non esce: deve prima cedere la proprietà.
create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) then
    raise exception 'guest_not_allowed' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = v_uid
  ) then
    raise exception 'not_group_member' using errcode = 'P0001';
  end if;

  select owner_id into v_owner from public.groups where id = p_group_id;
  if v_owner = v_uid then
    raise exception 'cannot_leave_as_owner' using errcode = 'P0001';
  end if;

  delete from public.group_members
  where group_id = p_group_id and user_id = v_uid;
end;
$$;

-- Il proprietario rimuove un membro. Non si rimuove il proprietario stesso.
create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) then
    raise exception 'guest_not_allowed' using errcode = 'P0001';
  end if;

  select owner_id into v_owner from public.groups where id = p_group_id for update;
  if v_owner is distinct from v_uid then
    raise exception 'not_group_owner' using errcode = 'P0001';
  end if;
  if p_user_id = v_owner then
    raise exception 'cannot_remove_owner' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  ) then
    raise exception 'not_group_member' using errcode = 'P0001';
  end if;

  delete from public.group_members
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

revoke all on function public.accept_invite(text) from public;
revoke all on function public.invite_link_status(text), public.invite_preview_stops(text) from public;
revoke all on function public.leave_group(uuid), public.remove_group_member(uuid, uuid) from public;
-- I privilegi predefiniti di Supabase danno EXECUTE ad anon: le funzioni per utenti autenticati lo tolgono.
revoke all on function public.accept_invite(text) from anon;
revoke all on function public.leave_group(uuid), public.remove_group_member(uuid, uuid) from anon;

grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.invite_link_status(text), public.invite_preview_stops(text) to anon, authenticated;
grant execute on function public.leave_group(uuid), public.remove_group_member(uuid, uuid) to authenticated;
