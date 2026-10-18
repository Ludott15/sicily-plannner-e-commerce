-- Passo 3.1 (M6): configurazione partner, click verticali, rate limit. Dopo la migrazione con
-- affiliate_partners e rate_limit_hits (e post-tables.sql).

----------------------------------------------------------------------------
-- AFFILIATE_PARTNER_CONFIG: configurazione di un partner per il generatore dei link.
-- Non segreta (template e host), ma non c'è lettura generica della tabella per il client.
----------------------------------------------------------------------------
create or replace function public.affiliate_partner_config(p_partner public.partner)
returns table (
  partner public.partner,
  name text,
  verticals text[],
  search_url_template text,
  allowed_hosts text[],
  subid_param text,
  partner_id_env text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.partner, p.name, p.verticals, p.search_url_template, p.allowed_hosts,
         p.subid_param, p.partner_id_env, p.is_active
  from public.affiliate_partners p
  where p.partner = p_partner
$$;

revoke all on function public.affiliate_partner_config(public.partner) from public;
grant execute on function public.affiliate_partner_config(public.partner) to anon, authenticated;

----------------------------------------------------------------------------
-- RECORD_AFFILIATE_CLICK (firma invariata a 5 argomenti, usata da src/server/affiliates/go.ts).
-- Oltre al controllo dell'offerta: il partner dev'essere attivo, e l'host dell'affiliate_url
-- deve stare in allowed_hosts del partner (target_not_allowed). Il parametro del subid viene da
-- affiliate_partners.subid_param, non più da una funzione fissa nel codice SQL.
----------------------------------------------------------------------------
create or replace function public.record_affiliate_click(
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
  v_partner public.affiliate_partners;
  v_host text;
  v_target text;
begin
  select o.* into v_offer
  from public.activity_offers o
  join public.activities a on a.id = o.activity_id
  where o.id = p_offer_id and o.is_active and a.is_active;
  if not found then
    raise exception 'offer_not_bookable' using errcode = 'P0001';
  end if;

  select p.* into v_partner
  from public.affiliate_partners p
  where p.partner = v_offer.partner;
  if not found or not v_partner.is_active then
    raise exception 'partner_not_active' using errcode = 'P0001';
  end if;

  -- Host esatto dell'URL del partner: niente userinfo (user@host), porta o host nel percorso.
  v_host := lower(substring(v_offer.affiliate_url from '^https://([^/?#]+)'));
  if v_host is null or not exists (
    select 1 from unnest(v_partner.allowed_hosts) h where lower(h) = v_host
  ) then
    raise exception 'target_not_allowed' using errcode = 'P0001';
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
  v_target := case
    when v_partner.subid_param is null or position('#' in v_offer.affiliate_url) > 0 then v_offer.affiliate_url
    when position('?' in v_offer.affiliate_url) > 0 then v_offer.affiliate_url || '&' || v_partner.subid_param || '=' || p_subid
    else v_offer.affiliate_url || '?' || v_partner.subid_param || '=' || p_subid
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

-- Il parametro ora sta nella tabella: la vecchia funzione fissa non serve più.
drop function if exists public.affiliate_subid_param(public.partner);

----------------------------------------------------------------------------
-- RECORD_VERTICAL_CLICK: click verso alloggi e noleggi (link costruito dal server dal template
-- del partner). Stessi controlli di record_flight_click, più: partner attivo, verticale
-- ammessa dal partner, host di p_target_url in allowed_hosts, https. Nessun offer_id né
-- activity_id: il click non è legato a un'offerta del catalogo.
----------------------------------------------------------------------------
create or replace function public.record_vertical_click(
  p_partner public.partner,
  p_vertical text,
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
  v_partner public.affiliate_partners;
  v_host text;
begin
  select p.* into v_partner
  from public.affiliate_partners p
  where p.partner = p_partner;
  if not found or not v_partner.is_active then
    raise exception 'partner_not_active' using errcode = 'P0001';
  end if;

  if p_vertical not in ('activity', 'lodging', 'car', 'flight') or not (p_vertical = any (v_partner.verticals)) then
    raise exception 'vertical_not_allowed' using errcode = 'P0001';
  end if;

  if p_subid !~ '^[a-z0-9]{12,32}$' then
    raise exception 'invalid_subid' using errcode = 'P0001';
  end if;

  if p_anon_id is not null and p_anon_id !~ '^[0-9a-f-]{36}$' then
    raise exception 'invalid_anon_id' using errcode = 'P0001';
  end if;

  if p_context not in ('page', 'itinerary', 'chat', 'flights') then
    raise exception 'invalid_context' using errcode = 'P0001';
  end if;

  if p_target_url !~ '^https://' then
    raise exception 'target_not_allowed' using errcode = 'P0001';
  end if;

  v_host := lower(substring(p_target_url from '^https://([^/?#]+)'));
  if v_host is null or not exists (
    select 1 from unnest(v_partner.allowed_hosts) h where lower(h) = v_host
  ) then
    raise exception 'target_not_allowed' using errcode = 'P0001';
  end if;

  if p_itinerary_id is not null and not public.can_access_itinerary(p_itinerary_id) then
    raise exception 'itinerary_not_accessible' using errcode = 'P0001';
  end if;

  insert into public.affiliate_clicks
    (user_id, activity_id, offer_id, partner, target_url, subid, context, itinerary_id, anon_id)
  values
    (v_uid, null, null, p_partner, p_target_url, p_subid, p_context, p_itinerary_id, p_anon_id);

  if v_uid is not null then
    insert into public.user_events (user_id, type, activity_id, itinerary_id)
    values (v_uid, 'affiliate_click', null, p_itinerary_id);
  end if;

  return p_subid;
end;
$$;

revoke all on function public.record_vertical_click(public.partner, text, text, text, text, text, uuid) from public;
grant execute on function public.record_vertical_click(public.partner, text, text, text, text, text, uuid) to anon, authenticated;

----------------------------------------------------------------------------
-- HIT_RATE_LIMIT: contatore a finestra fissa. true = consentito, false = oltre il limite.
-- Il bucket lo calcola il server (HMAC di IP o utente): qui solo il formato. Le righe più
-- vecchie di un giorno si tolgono a ogni chiamata, in una quantità limitata.
----------------------------------------------------------------------------
create or replace function public.hit_rate_limit(
  p_bucket text,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz;
  v_hits int;
begin
  if p_bucket is null or p_bucket !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception 'invalid_rate_limit' using errcode = 'P0001';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100000 then
    raise exception 'invalid_rate_limit' using errcode = 'P0001';
  end if;

  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid_rate_limit' using errcode = 'P0001';
  end if;

  v_window := to_timestamp(
    (floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)::double precision
  );

  insert into public.rate_limit_hits (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start)
  do update set hits = public.rate_limit_hits.hits + 1
  returning hits into v_hits;

  delete from public.rate_limit_hits r
  where (r.bucket, r.window_start) in (
    select x.bucket, x.window_start
    from public.rate_limit_hits x
    where x.window_start < now() - interval '1 day'
    limit 500
  );

  return v_hits <= p_limit;
end;
$$;

revoke all on function public.hit_rate_limit(text, int, int) from public;
grant execute on function public.hit_rate_limit(text, int, int) to anon, authenticated;
