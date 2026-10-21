-- Passo 3.2 (verticali affiliate): le verticali nuove entrano nel vincolo su affiliate_partners.verticals
-- e in record_vertical_click. Lista identica in src/server/db/schema/affiliates.ts e in
-- src/server/affiliates/vertical-links.ts (VERTICALS). Dopo la migrazione enum (20261021151338).
-- La funzione non è nello schema Drizzle: il vincolo sì, lo snapshot resta quello del diff.
ALTER TABLE "affiliate_partners" DROP CONSTRAINT "affiliate_partners_verticals_valid";--> statement-breakpoint
ALTER TABLE "affiliate_partners" ADD CONSTRAINT "affiliate_partners_verticals_valid" CHECK (cardinality("affiliate_partners"."verticals") > 0 and "affiliate_partners"."verticals" <@ array['activity','lodging','car','flight','ferry','train','transfer','tickets','boat','insurance','esim','luggage']::text[]);
----------------------------------------------------------------------------
-- RECORD_VERTICAL_CLICK: come nella migrazione 20261014174139, con le verticali nuove.
-- Stessa firma (7 argomenti): nessun grant cambia.
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

  if p_vertical not in ('activity', 'lodging', 'car', 'flight', 'ferry', 'train', 'transfer', 'tickets', 'boat', 'insurance', 'esim', 'luggage')
     or not (p_vertical = any (v_partner.verticals)) then
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
