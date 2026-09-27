-- Itinerari e gruppi: funzioni di supporto, ingresso nei gruppi, viste e RLS.
-- Tutte le funzioni SECURITY DEFINER fissano search_path = public, pg_temp.
-- Errori di dominio: SQLSTATE P0001 con messaggio stabile (usato dall'app e dai test).

----------------------------------------------------------------------------
-- FUNZIONI DI SUPPORTO (usate dalle policy)
----------------------------------------------------------------------------

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_owner(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.groups
    where id = gid and owner_id = auth.uid()
  );
$$;

-- Proprietario, membro del gruppo collegato, oppure template pubblico.
create or replace function public.can_access_itinerary(iid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.itineraries i
    where i.id = iid
      and (
        i.is_template
        or i.owner_id = auth.uid()
        or (i.group_id is not null and public.is_group_member(i.group_id))
      )
  );
$$;

-- Proprietario, membro del gruppo collegato, oppure admin sui template.
create or replace function public.can_edit_itinerary(iid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.itineraries i
    where i.id = iid
      and (
        i.owner_id = auth.uid()
        or (i.group_id is not null and public.is_group_member(i.group_id))
        or (i.is_template and public.is_admin())
      )
  );
$$;

-- Si vota solo sulle voci di un itinerario di gruppo di cui si è membri.
create or replace function public.can_vote_item(item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.itinerary_items ii
    join public.itineraries i on i.id = ii.itinerary_id
    where ii.id = item_id
      and i.group_id is not null
      and public.is_group_member(i.group_id)
  );
$$;

revoke all on function public.is_group_member(uuid), public.is_group_owner(uuid),
  public.can_access_itinerary(uuid), public.can_edit_itinerary(uuid), public.can_vote_item(uuid)
  from public;
grant execute on function public.is_group_member(uuid), public.is_group_owner(uuid),
  public.can_edit_itinerary(uuid), public.can_vote_item(uuid)
  to authenticated;
grant execute on function public.can_access_itinerary(uuid) to anon, authenticated;

----------------------------------------------------------------------------
-- GRUPPI: creazione, proprietà, inviti
----------------------------------------------------------------------------

-- Il proprietario è sempre anche membro con ruolo owner.
create or replace function public.groups_add_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

revoke all on function public.groups_add_owner_member() from public, anon, authenticated;

create trigger groups_add_owner_member
  after insert on public.groups
  for each row execute function public.groups_add_owner_member();

-- Unica via di creazione dal client: collega in modo atomico gruppo e itinerario.
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

-- Passa gruppo e itinerario collegato a un altro membro; serve prima che l'owner esca.
create or replace function public.transfer_group_ownership(p_group_id uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_group public.groups;
begin
  select * into v_group from public.groups where id = p_group_id for update;
  if not found or v_group.owner_id is distinct from v_uid then
    raise exception 'not_group_owner' using errcode = 'P0001';
  end if;

  if p_new_owner = v_uid or not exists (
    select 1 from public.group_members where group_id = p_group_id and user_id = p_new_owner
  ) then
    raise exception 'new_owner_not_member' using errcode = 'P0001';
  end if;

  update public.groups set owner_id = p_new_owner where id = p_group_id;
  update public.group_members set role = 'member' where group_id = p_group_id and user_id = v_uid;
  update public.group_members set role = 'owner' where group_id = p_group_id and user_id = p_new_owner;
  update public.itineraries set owner_id = p_new_owner
  where id = v_group.itinerary_id and owner_id = v_uid;
end;
$$;

-- Verifica hash, stato, scadenza e usi; inserisce il membro e incrementa uses
-- nella stessa transazione. La riga dell'invito è bloccata per evitare corse sugli usi.
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

-- Anteprima per /invito/[token], anche senza account: solo per inviti validi.
create or replace function public.invite_preview(p_token text)
returns table (
  group_id uuid,
  group_name text,
  owner_display_name text,
  owner_avatar_url text,
  itinerary_id uuid,
  itinerary_title text,
  itinerary_days smallint,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select g.id, g.name, p.display_name, p.avatar_url, i.id, i.title, i.days, gi.expires_at
  from public.group_invites gi
  join public.groups g on g.id = gi.group_id
  join public.profiles p on p.id = g.owner_id
  left join public.itineraries i on i.id = g.itinerary_id
  where gi.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and gi.status = 'active'
    and gi.expires_at > now()
    and gi.uses < gi.max_uses;
$$;

revoke all on function public.create_group(text, uuid), public.transfer_group_ownership(uuid, uuid),
  public.accept_invite(text), public.invite_preview(text)
  from public;
grant execute on function public.create_group(text, uuid), public.transfer_group_ownership(uuid, uuid),
  public.accept_invite(text)
  to authenticated;
grant execute on function public.invite_preview(text) to anon, authenticated;

----------------------------------------------------------------------------
-- RLS: ITINERARI
----------------------------------------------------------------------------

alter table public.itineraries enable row level security;
alter table public.itinerary_items enable row level security;

revoke all on table public.itineraries, public.itinerary_items from anon, authenticated;

-- id è inseribile dal client (UUID generato nel builder per gli aggiornamenti ottimistici).
-- owner_id e group_id non sono modificabili dal client: il collegamento al gruppo
-- passa da create_group, il cambio di proprietario da transfer_group_ownership.
grant select on table public.itineraries to anon, authenticated;
grant insert (id, owner_id, title, slug, is_template, template_id, start_date, days, status)
  on table public.itineraries to authenticated;
grant update (title, start_date, days, status) on table public.itineraries to authenticated;
grant delete on table public.itineraries to authenticated;

create policy itineraries_select_template_anon on public.itineraries
  for select to anon
  using (is_template);

create policy itineraries_select_authenticated on public.itineraries
  for select to authenticated
  using (
    is_template
    or owner_id = (select auth.uid())
    or (group_id is not null and public.is_group_member(group_id))
  );

-- Utenti: solo itinerari propri, senza slug (riservato agli editoriali).
-- Admin: template editoriali (owner_id null).
create policy itineraries_insert on public.itineraries
  for insert to authenticated
  with check (
    (
      (owner_id = (select auth.uid()) and not is_template and slug is null)
      or (owner_id is null and is_template and (select public.is_admin()))
    )
    and (template_id is null or public.can_access_itinerary(template_id))
  );

create policy itineraries_update on public.itineraries
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    or (group_id is not null and public.is_group_member(group_id))
    or (is_template and (select public.is_admin()))
  )
  with check (
    owner_id = (select auth.uid())
    or (group_id is not null and public.is_group_member(group_id))
    or (is_template and (select public.is_admin()))
  );

create policy itineraries_delete on public.itineraries
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    or (is_template and (select public.is_admin()))
  );

grant select on table public.itinerary_items to anon, authenticated;
grant insert (id, itinerary_id, day_index, position, activity_id, place_id, custom_title, start_time, notes)
  on table public.itinerary_items to authenticated;
grant update (day_index, position, activity_id, place_id, custom_title, start_time, notes)
  on table public.itinerary_items to authenticated;
grant delete on table public.itinerary_items to authenticated;

create policy itinerary_items_select on public.itinerary_items
  for select to anon, authenticated
  using (public.can_access_itinerary(itinerary_id));

create policy itinerary_items_insert on public.itinerary_items
  for insert to authenticated
  with check (public.can_edit_itinerary(itinerary_id));

create policy itinerary_items_update on public.itinerary_items
  for update to authenticated
  using (public.can_edit_itinerary(itinerary_id))
  with check (public.can_edit_itinerary(itinerary_id));

create policy itinerary_items_delete on public.itinerary_items
  for delete to authenticated
  using (public.can_edit_itinerary(itinerary_id));

----------------------------------------------------------------------------
-- RLS: GRUPPI
----------------------------------------------------------------------------

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.item_votes enable row level security;

revoke all on table public.groups, public.group_members, public.group_invites, public.item_votes
  from anon, authenticated;

-- groups: creazione solo via create_group; l'owner rinomina ed elimina
grant select, delete on table public.groups to authenticated;
grant update (name) on table public.groups to authenticated;

create policy groups_select_members on public.groups
  for select to authenticated
  using (public.is_group_member(id));

create policy groups_update_owner on public.groups
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy groups_delete_owner on public.groups
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- group_members: ingresso solo via accept_invite (e trigger per l'owner).
-- Un membro esce da solo; l'owner rimuove gli altri ma per uscire deve prima cedere la proprietà.
grant select, delete on table public.group_members to authenticated;

create policy group_members_select_members on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));

create policy group_members_delete on public.group_members
  for delete to authenticated
  using (
    (user_id = (select auth.uid()) and not public.is_group_owner(group_id))
    or (public.is_group_owner(group_id) and user_id <> (select auth.uid()))
  );

-- group_invites: solo l'owner del gruppo; uses lo incrementa solo accept_invite;
-- l'unico cambio di stato ammesso dal client è la revoca.
grant select, delete on table public.group_invites to authenticated;
grant insert (group_id, token_hash, email, invited_by, expires_at, max_uses)
  on table public.group_invites to authenticated;
grant update (status) on table public.group_invites to authenticated;

create policy group_invites_select_owner on public.group_invites
  for select to authenticated
  using (public.is_group_owner(group_id));

create policy group_invites_insert_owner on public.group_invites
  for insert to authenticated
  with check (invited_by = (select auth.uid()) and public.is_group_owner(group_id));

create policy group_invites_update_owner on public.group_invites
  for update to authenticated
  using (public.is_group_owner(group_id))
  with check (public.is_group_owner(group_id) and status = 'revoked');

create policy group_invites_delete_owner on public.group_invites
  for delete to authenticated
  using (public.is_group_owner(group_id));

-- item_votes: ogni membro vota solo per sé; i voti di un ex membro restano ma
-- lui non li vede né li modifica, e non contano nel saldo (vista item_vote_balances).
grant select, delete on table public.item_votes to authenticated;
grant insert (itinerary_item_id, user_id, value) on table public.item_votes to authenticated;
grant update (value) on table public.item_votes to authenticated;

create policy item_votes_select_members on public.item_votes
  for select to authenticated
  using (public.can_vote_item(itinerary_item_id));

create policy item_votes_insert_own on public.item_votes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_vote_item(itinerary_item_id));

create policy item_votes_update_own on public.item_votes
  for update to authenticated
  using (user_id = (select auth.uid()) and public.can_vote_item(itinerary_item_id))
  with check (user_id = (select auth.uid()) and public.can_vote_item(itinerary_item_id));

create policy item_votes_delete_own on public.item_votes
  for delete to authenticated
  using (user_id = (select auth.uid()) and public.can_vote_item(itinerary_item_id));

----------------------------------------------------------------------------
-- VISTE
----------------------------------------------------------------------------

-- Saldo per voce: conta solo i voti di chi è ancora membro del gruppo.
-- security_invoker: si applica la RLS di chi interroga (solo i membri vedono i voti).
create view public.item_vote_balances
with (security_invoker = true)
as
select
  v.itinerary_item_id,
  sum(v.value)::int as balance,
  (count(*) filter (where v.value = 1))::int as up_votes,
  (count(*) filter (where v.value = -1))::int as down_votes
from public.item_votes v
join public.itinerary_items ii on ii.id = v.itinerary_item_id
join public.itineraries i on i.id = ii.itinerary_id
join public.group_members gm on gm.group_id = i.group_id and gm.user_id = v.user_id
group by v.itinerary_item_id;

revoke all on public.item_vote_balances from anon, authenticated;
grant select on public.item_vote_balances to authenticated;

-- Nome e avatar dei compagni di gruppo, senza le altre colonne di profiles.
-- Vista con i privilegi del proprietario (non security_invoker) perché profiles resta
-- leggibile solo dal proprietario; il filtro è is_group_member del chiamante.
create view public.group_member_profiles
with (security_barrier = true)
as
select gm.group_id, gm.user_id, gm.role, gm.joined_at, p.display_name, p.avatar_url
from public.group_members gm
join public.profiles p on p.id = gm.user_id
where public.is_group_member(gm.group_id);

revoke all on public.group_member_profiles from anon, authenticated;
grant select on public.group_member_profiles to authenticated;
