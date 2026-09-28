-- day_titles: scrivibile da chi può creare o modificare l'itinerario (stesse policy).
grant insert (day_titles) on table public.itineraries to authenticated;
grant update (day_titles) on table public.itineraries to authenticated;

-- Click affiliato registrato da /api/go/[id] (anticipo minimo della milestone 6).
-- La route calcola subid e URL finale (server/affiliates/links.ts); la funzione verifica
-- che l'attività sia attiva e prenotabile e che l'URL finale parta dall'affiliate_url
-- salvato nel catalogo: nessun URL arbitrario entra nel registro né viene usato per il
-- redirect. L'utente è auth.uid() (null per gli anonimi), mai un parametro.
create or replace function public.record_affiliate_click(
  p_activity_id uuid,
  p_subid text,
  p_target_url text,
  p_context text,
  p_anon_id text default null,
  p_itinerary_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_activity public.activities;
begin
  select * into v_activity from public.activities where id = p_activity_id;
  if not found or not v_activity.is_active or v_activity.affiliate_url is null then
    raise exception 'activity_not_bookable' using errcode = 'P0001';
  end if;

  if left(p_target_url, length(v_activity.affiliate_url)) <> v_activity.affiliate_url then
    raise exception 'target_mismatch' using errcode = 'P0001';
  end if;

  if p_subid !~ '^[a-z0-9]{12,32}$' then
    raise exception 'invalid_subid' using errcode = 'P0001';
  end if;

  if p_anon_id is not null and p_anon_id !~ '^[0-9a-f-]{36}$' then
    raise exception 'invalid_anon_id' using errcode = 'P0001';
  end if;

  if p_itinerary_id is not null and not public.can_access_itinerary(p_itinerary_id) then
    raise exception 'itinerary_not_accessible' using errcode = 'P0001';
  end if;

  insert into public.affiliate_clicks (user_id, activity_id, partner, target_url, subid, context, itinerary_id, anon_id)
  values (v_uid, p_activity_id, v_activity.partner, p_target_url, p_subid, p_context, p_itinerary_id, p_anon_id);

  if v_uid is not null then
    insert into public.user_events (user_id, type, activity_id, itinerary_id)
    values (v_uid, 'affiliate_click', p_activity_id, p_itinerary_id);
  end if;
end;
$$;

revoke all on function public.record_affiliate_click(uuid, text, text, text, text, uuid) from public;
grant execute on function public.record_affiliate_click(uuid, text, text, text, text, uuid) to anon, authenticated;
