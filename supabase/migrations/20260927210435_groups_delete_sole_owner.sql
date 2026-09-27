-- L'owner elimina il gruppo solo se è l'unico membro. Con altri membri deve prima
-- cedere la proprietà (transfer_group_ownership) e uscire, oppure rimuovere i membri.

create or replace function public.group_has_other_members(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.group_id = gid and gm.user_id <> g.owner_id
  );
$$;

revoke all on function public.group_has_other_members(uuid) from public;
grant execute on function public.group_has_other_members(uuid) to authenticated;

drop policy groups_delete_owner on public.groups;

create policy groups_delete_sole_owner on public.groups
  for delete to authenticated
  using (owner_id = (select auth.uid()) and not public.group_has_other_members(id));
