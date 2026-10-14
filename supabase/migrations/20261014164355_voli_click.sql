-- Voli (passo 2.1): click verso Aviasales registrato senza offerta (il check di arrival_airport
-- e il valore flight_search sono nella migrazione generata precedente).

-- 2. record_flight_click registra un click verso Aviasales (partner travelpayouts) e restituisce
-- il subid. Nessuna tabella nuova: il link è costruito dal server e firmato, qui si controlla
-- solo che la destinazione stia nell'host consentito. Come record_affiliate_click, la funzione
-- è SECURITY DEFINER: anon e authenticated non scrivono in affiliate_clicks.
create function public.record_flight_click(
  p_subid text,
  p_context text,
  p_target_url text,
  p_anon_id text default null,
  p_itinerary_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if p_subid !~ '^[a-z0-9]{12,32}$' then
    raise exception 'invalid_subid' using errcode = 'P0001';
  end if;

  if p_anon_id is not null and p_anon_id !~ '^[0-9a-f-]{36}$' then
    raise exception 'invalid_anon_id' using errcode = 'P0001';
  end if;

  if p_context not in ('page', 'itinerary', 'chat', 'flights') then
    raise exception 'invalid_context' using errcode = 'P0001';
  end if;

  if p_target_url !~ '^https://www\.aviasales\.com/' then
    raise exception 'target_not_allowed' using errcode = 'P0001';
  end if;

  if p_itinerary_id is not null and not public.can_access_itinerary(p_itinerary_id) then
    raise exception 'itinerary_not_accessible' using errcode = 'P0001';
  end if;

  insert into public.affiliate_clicks
    (user_id, activity_id, offer_id, partner, target_url, subid, context, itinerary_id, anon_id)
  values
    (v_uid, null, null, 'travelpayouts', p_target_url, p_subid, p_context, p_itinerary_id, p_anon_id);

  if v_uid is not null then
    insert into public.user_events (user_id, type, activity_id, itinerary_id)
    values (v_uid, 'affiliate_click', null, p_itinerary_id);
  end if;

  return p_subid;
end;
$$;

revoke all on function public.record_flight_click(text, text, text, text, uuid) from public;
grant execute on function public.record_flight_click(text, text, text, text, uuid) to anon, authenticated;
