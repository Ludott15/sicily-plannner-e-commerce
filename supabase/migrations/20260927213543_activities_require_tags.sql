-- Un'attività senza tag di interesse non può essere attiva: senza tag lo scoring non funziona.
-- Vale per ogni ruolo (admin, import, postgres). Il controllo è un constraint trigger
-- differito a fine transazione, così l'admin può creare un'attività attiva e i suoi tag
-- nella stessa transazione. Scatta anche se si rimuove l'ultimo tag di un'attività attiva.

create or replace function public.check_activity_has_tags()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_activity_id uuid;
begin
  if tg_table_name = 'activities' then
    v_activity_id := new.id;
  else
    v_activity_id := old.activity_id;
  end if;

  if exists (
    select 1 from public.activities a
    where a.id = v_activity_id
      and a.is_active
      and not exists (select 1 from public.activity_interests ai where ai.activity_id = a.id)
  ) then
    raise exception 'activity_without_tags' using errcode = 'P0001';
  end if;

  return null;
end;
$$;

revoke all on function public.check_activity_has_tags() from public, anon, authenticated;

create constraint trigger activities_require_tags
  after insert or update of is_active on public.activities
  deferrable initially deferred
  for each row
  when (new.is_active)
  execute function public.check_activity_has_tags();

create constraint trigger activity_interests_keep_active_tagged
  after delete or update of activity_id on public.activity_interests
  deferrable initially deferred
  for each row
  execute function public.check_activity_has_tags();
