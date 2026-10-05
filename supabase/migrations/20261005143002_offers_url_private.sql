-- affiliate_url delle offerte non leggibile dal client (anon e authenticated, admin compreso):
-- l'URL del partner esce solo come destinazione di un click registrato. L'admin lo legge e lo
-- scrive dal server (dbAdmin). Grant di lettura per colonna, senza affiliate_url.
revoke select on table public.activity_offers from anon, authenticated;
grant select (
  id, activity_id, partner, partner_product_id, title, price_from_eur, currency,
  rating, reviews_count, free_cancellation, price_updated_at, is_active, created_at
) on table public.activity_offers to anon, authenticated;

-- record_affiliate_click costruisce l'URL finale (affiliate_url dell'offerta più il parametro
-- del subid previsto dal partner), registra il click e lo restituisce: /api/go non legge più
-- l'URL e nessun URL arriva dalla richiesta. I nomi dei parametri sono da confermare con i
-- termini di ogni programma prima della milestone 6.
drop function public.record_affiliate_click(uuid, text, text, text, text, uuid);

create function public.affiliate_subid_param(p_partner public.partner)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_partner
    when 'getyourguide' then 'cmp'
    when 'viator' then 'campaign'
    when 'travelpayouts' then 'sub_id'
    when 'car_rental' then 'subid'
    else null
  end
$$;

create function public.record_affiliate_click(
  p_offer_id uuid,
  p_subid text,
  p_context text,
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
  v_offer public.activity_offers;
  v_param text;
  v_target text;
begin
  select o.* into v_offer
  from public.activity_offers o
  join public.activities a on a.id = o.activity_id
  where o.id = p_offer_id and o.is_active and a.is_active;
  if not found then
    raise exception 'offer_not_bookable' using errcode = 'P0001';
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

  -- Il parametro si aggiunge in coda senza riscrivere l'URL di base; con un frammento (#)
  -- l'URL resta com'è.
  v_param := public.affiliate_subid_param(v_offer.partner);
  v_target := case
    when v_param is null or position('#' in v_offer.affiliate_url) > 0 then v_offer.affiliate_url
    when position('?' in v_offer.affiliate_url) > 0 then v_offer.affiliate_url || '&' || v_param || '=' || p_subid
    else v_offer.affiliate_url || '?' || v_param || '=' || p_subid
  end;

  insert into public.affiliate_clicks
    (user_id, activity_id, offer_id, partner, target_url, subid, context, itinerary_id, anon_id)
  values
    (v_uid, v_offer.activity_id, v_offer.id, v_offer.partner, v_target, p_subid, p_context, p_itinerary_id, p_anon_id);

  if v_uid is not null then
    insert into public.user_events (user_id, type, activity_id, itinerary_id)
    values (v_uid, 'affiliate_click', v_offer.activity_id, p_itinerary_id);
  end if;

  return v_target;
end;
$$;

revoke all on function public.record_affiliate_click(uuid, text, text, text, uuid) from public;
grant execute on function public.record_affiliate_click(uuid, text, text, text, uuid) to anon, authenticated;
revoke all on function public.affiliate_subid_param(public.partner) from public, anon, authenticated;
