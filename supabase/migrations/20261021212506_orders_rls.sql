-- Ordini (passo 7.3): RLS e grant per colonna di orders e order_items, funzioni di lettura per gli ospiti
-- e per la pagina di esito, e chiusura di una sessione per pagamento fallito. Tabelle e colonne sono nella
-- migrazione Drizzle 20261021212445_orders (src/server/db/schema/shop.ts). Non modifica migrazioni già committate.
--
-- Regole:
-- - il cliente legge solo le proprie righe, con le colonne elencate qui: mai costo d'acquisto, fornitore,
--   codice del fornitore, token, id di Stripe né note interne;
-- - nessuna scrittura dai client: ordini e righe li scrive il webhook (dbAdmin, ruolo postgres);
-- - l'ospite accede con il numero d'ordine e il token del link: la funzione order_guest_detail riceve il
--   token, ne calcola lo SHA-256 nel database e confronta con access_token_hash. Nessun hash esce dal database;
-- - le funzioni con grant ad anon non restituiscono nulla senza il token giusto o, per l'esito, senza
--   l'id di sessione di Stripe (che solo il cliente riceve dal redirect).

----------------------------------------------------------------------------
-- orders: il proprietario legge le sue colonne. Il token e l'id di Stripe non sono leggibili dai client.
----------------------------------------------------------------------------
revoke all on table public.orders from anon, authenticated;
grant select (
  id, order_number, user_id, email, locale, status, subtotal_cents, discount_cents, shipping_cents,
  total_cents, points_redeemed, shipping_address, carrier, tracking_number, tracking_url, shipped_at,
  delivered_at, created_at
) on table public.orders to authenticated;

-- Sugli ordini c'è solo la policy orders_select_own (proprietario, da auth.uid()). Non esiste una policy
-- admin sul client: l'admin legge e scrive con dbAdmin lato server. I ruoli applicativi non scrivono mai.

----------------------------------------------------------------------------
-- order_items: il proprietario legge le righe del proprio ordine, senza costo, fornitore e codice.
----------------------------------------------------------------------------
revoke all on table public.order_items from anon, authenticated;
grant select (
  id, order_id, product_id, producer_id, quantity, unit_price_cents, vat_rate, title_snapshot, created_at
) on table public.order_items to authenticated;

----------------------------------------------------------------------------
-- checkout_fail_from_stripe (interna): evento checkout.session.async_payment_failed senza ordine collegato.
-- Chiude la riga aperta (per checkout_id o per id di sessione) con 'failed' e restituisce i punti una volta.
-- La chiama solo il webhook con dbAdmin.
----------------------------------------------------------------------------
create or replace function public.checkout_fail_from_stripe(p_checkout_id uuid, p_stripe_session_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  select cs.id into v_id
    from public.checkout_sessions cs
   where cs.status = 'open'
     and (cs.id = p_checkout_id or cs.stripe_session_id = p_stripe_session_id)
   order by (cs.id = p_checkout_id) desc nulls last
   limit 1;
  if v_id is null then
    return false;
  end if;
  return public.checkout_close(v_id, 'failed');
end;
$$;

revoke all on function public.checkout_fail_from_stripe(uuid, text) from public, anon, authenticated;

----------------------------------------------------------------------------
-- order_guest_detail: dettaglio di un ordine ospite. Riceve il token del link (43 caratteri base64url),
-- ne calcola lo SHA-256 nel database e restituisce la riga solo se coincide con access_token_hash. Solo
-- ordini senza account (user_id null). Nessun costo, nessun fornitore, nessun codice del fornitore, nessun
-- id di Stripe. Nessun hash viene restituito: la funzione non rivela nulla senza il token giusto.
-- Un token di forma diversa non trova nulla (il controllo regex è dentro la query).
----------------------------------------------------------------------------
create or replace function public.order_guest_detail(p_order_number text, p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'order_number', o.order_number,
    'status', o.status,
    'created_at', o.created_at,
    'subtotal_cents', o.subtotal_cents,
    'discount_cents', o.discount_cents,
    'shipping_cents', o.shipping_cents,
    'total_cents', o.total_cents,
    'points_redeemed', o.points_redeemed,
    'shipping_address', o.shipping_address,
    'carrier', o.carrier,
    'tracking_number', o.tracking_number,
    'tracking_url', o.tracking_url,
    'shipped_at', o.shipped_at,
    'delivered_at', o.delivered_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', i.title_snapshot,
        'quantity', i.quantity,
        'unit_price_cents', i.unit_price_cents,
        'vat_rate', i.vat_rate
      ) order by i.created_at, i.id)
        from public.order_items i
       where i.order_id = o.id
    ), '[]'::jsonb)
  )
    from public.orders o
   where o.order_number = p_order_number
     and o.user_id is null
     and o.access_token_hash is not null
     and p_token ~ '^[A-Za-z0-9_-]{43}$'
     and o.access_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

revoke all on function public.order_guest_detail(text, text) from public;
grant execute on function public.order_guest_detail(text, text) to anon, authenticated;

----------------------------------------------------------------------------
-- order_for_checkout_session: pagina di esito. Dato l'id della sessione Stripe (il cliente lo riceve dal
-- redirect), restituisce numero e stato dell'ordine se il webhook è arrivato. Null finché non c'è l'ordine.
-- Non restituisce né email né indirizzo.
----------------------------------------------------------------------------
create or replace function public.order_for_checkout_session(p_stripe_session_id text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('order_number', o.order_number, 'status', o.status)
    from public.orders o
   where o.stripe_session_id = p_stripe_session_id;
$$;

revoke all on function public.order_for_checkout_session(text) from public;
grant execute on function public.order_for_checkout_session(text) to anon, authenticated;
