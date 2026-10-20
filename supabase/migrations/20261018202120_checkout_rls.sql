-- Pagamenti e checkout (passo 7.2): RLS e grant delle tabelle checkout_sessions e stripe_events, funzioni
-- del checkout e della scadenza. Tabelle e colonne sono in src/server/db/schema/checkout.ts (migrazione
-- Drizzle generata a parte); questo file va come migrazione custom (`npm run db:generate -- --custom`)
-- dopo quella Drizzle. Non modifica migrazioni già committate.
--
-- Regole:
-- - i punti passano solo da public.award_points (ref_id = id della sessione di checkout);
-- - una sessione passa da 'open' a 'expired' o 'failed' una volta sola (condizione status = 'open'),
--   e i punti si restituiscono una volta sola (redeem_refund, unique di points_ledger);
-- - le funzioni che il server chiama come ospite (anon) non prendono importi dal client: il subtotale
--   deve coincidere con lo snapshot del carrello, calcolato dal server dal database;
-- - checkout_attach_stripe_session e checkout_release richiedono il token monouso della riga: il server
--   lo genera in checkout_create (si salva solo il suo SHA-256) e lo tiene in memoria per la richiesta.
--   Chi conosce solo l'uuid di una sessione non può collegarla né annullarla.

----------------------------------------------------------------------------
-- checkout_sessions: il proprietario legge le sue, l'admin legge tutto. Nessuna scrittura dai client.
----------------------------------------------------------------------------
alter table public.checkout_sessions enable row level security;
revoke all on table public.checkout_sessions from anon, authenticated;
-- token_hash non è leggibile dai client: anche l'hash non serve a nessuno fuori dal server.
grant select (
  id, stripe_session_id, user_id, cart, subtotal_cents, shipping_cents, discount_cents,
  points_redeemed, status, created_at, expires_at
) on table public.checkout_sessions to authenticated;

create policy checkout_sessions_select_own on public.checkout_sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy checkout_sessions_select_admin on public.checkout_sessions
  for select to authenticated
  using ((select public.is_admin()));

----------------------------------------------------------------------------
-- stripe_events: solo admin in lettura. Il webhook scrive con dbAdmin (ruolo postgres).
----------------------------------------------------------------------------
alter table public.stripe_events enable row level security;
revoke all on table public.stripe_events from anon, authenticated;
grant select on table public.stripe_events to authenticated;

create policy stripe_events_select_admin on public.stripe_events
  for select to authenticated
  using ((select public.is_admin()));

----------------------------------------------------------------------------
-- checkout_create: crea la sessione di checkout e, se richiesto, scala i punti in un'unica transazione.
-- Ospiti e visitatori senza account: nessun punto, user_id null. Account: il saldo è letto sotto lock
-- per utente, così due checkout in parallelo non spendono due volte gli stessi punti.
-- Lo sconto è in euro interi: min(saldo / 100, 15% del subtotale / 100). Le regole sono costanti della
-- funzione (100 punti per euro, 15% massimo): src/lib/shop/config.ts le ha uguali, e il test
-- src/lib/shop/checkout-sql.test.ts controlla che lo restino.
----------------------------------------------------------------------------
create or replace function public.checkout_create(
  p_checkout_id uuid,
  p_cart jsonb,
  p_subtotal_cents integer,
  p_shipping_cents integer,
  p_use_points boolean,
  p_expires_at timestamptz,
  p_token_hash text
)
returns table (discount_cents integer, points_redeemed integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_points_per_euro constant integer := 100;
  c_max_points_percent constant integer := 15;
  v_user uuid := (select auth.uid());
  v_account boolean := false;
  v_balance integer := 0;
  v_euros integer := 0;
  v_discount integer := 0;
  v_points integer := 0;
  v_cart_total integer := 0;
begin
  if jsonb_typeof(p_cart) is distinct from 'array' or jsonb_array_length(p_cart) = 0 then
    raise exception 'checkout_empty' using errcode = 'P0001';
  end if;

  select coalesce(sum((line->>'unitPriceCents')::integer * (line->>'quantity')::integer), 0)::integer
    into v_cart_total
    from jsonb_array_elements(p_cart) as line;
  if v_cart_total <> p_subtotal_cents then
    raise exception 'checkout_mismatch' using errcode = 'P0001';
  end if;

  v_account := v_user is not null
    and not exists (select 1 from auth.users u where u.id = v_user and u.is_anonymous);

  if p_use_points and v_account then
    perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
    select coalesce(sum(l.delta), 0)::integer into v_balance
      from public.points_ledger l where l.user_id = v_user;
    v_euros := least(
      greatest(v_balance, 0) / c_points_per_euro,
      ((p_subtotal_cents::bigint * c_max_points_percent) / 10000)::integer
    );
    v_euros := greatest(v_euros, 0);
    v_discount := v_euros * 100;
    v_points := v_euros * c_points_per_euro;
  end if;

  insert into public.checkout_sessions (
    id, user_id, cart, subtotal_cents, shipping_cents, discount_cents, points_redeemed, status, expires_at,
    token_hash
  ) values (
    p_checkout_id, case when v_account then v_user end, p_cart, p_subtotal_cents, p_shipping_cents,
    v_discount, v_points, 'open', p_expires_at, p_token_hash
  );

  if v_points > 0 then
    if not public.award_points(v_user, -v_points, 'redeem', 'checkout', p_checkout_id) then
      raise exception 'points_not_recorded' using errcode = 'P0001';
    end if;
  end if;

  return query select v_discount, v_points;
end;
$$;

revoke all on function public.checkout_create(uuid, jsonb, integer, integer, boolean, timestamptz, text) from public;
grant execute on function public.checkout_create(uuid, jsonb, integer, integer, boolean, timestamptz, text) to anon, authenticated;

----------------------------------------------------------------------------
-- checkout_check_token (interna): il token monouso della riga (quello generato dal server in
-- checkout_create) deve corrispondere all'hash salvato. Senza token giusto: 42501, anche se l'uuid esiste.
----------------------------------------------------------------------------
create or replace function public.checkout_check_token(p_checkout_id uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_token is null or not exists (
    select 1 from public.checkout_sessions cs
    where cs.id = p_checkout_id
      and cs.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'checkout_token_invalid' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.checkout_check_token(uuid, text) from public, anon, authenticated;

----------------------------------------------------------------------------
-- checkout_attach_stripe_session: collega l'id della sessione Stripe alla riga aperta. Una sola volta.
----------------------------------------------------------------------------
create or replace function public.checkout_attach_stripe_session(p_checkout_id uuid, p_token text, p_stripe_session_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  perform public.checkout_check_token(p_checkout_id, p_token);
  update public.checkout_sessions
     set stripe_session_id = p_stripe_session_id
   where id = p_checkout_id and status = 'open' and stripe_session_id is null;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.checkout_attach_stripe_session(uuid, text, text) from public;
grant execute on function public.checkout_attach_stripe_session(uuid, text, text) to anon, authenticated;

----------------------------------------------------------------------------
-- checkout_close (interna): chiude una sessione aperta e restituisce i punti, una volta sola.
-- Non è concessa a anon né ad authenticated: la chiamano checkout_release e il webhook (dbAdmin).
----------------------------------------------------------------------------
create or replace function public.checkout_close(p_checkout_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_points integer;
begin
  if p_status not in ('expired', 'failed') then
    raise exception 'checkout_status_invalid' using errcode = 'P0001';
  end if;

  update public.checkout_sessions
     set status = p_status
   where id = p_checkout_id and status = 'open'
   returning user_id, points_redeemed into v_user, v_points;
  if not found then
    return false;
  end if;

  if v_points > 0 and v_user is not null then
    perform public.award_points(v_user, v_points, 'redeem_refund', 'checkout', p_checkout_id);
  end if;
  return true;
end;
$$;

revoke all on function public.checkout_close(uuid, text) from public, anon, authenticated;

----------------------------------------------------------------------------
-- checkout_release: il server annulla una sessione che non è riuscito a creare su Stripe.
-- Rifiuta le righe con una sessione Stripe: quelle si chiudono con la scadenza (webhook).
----------------------------------------------------------------------------
create or replace function public.checkout_release(p_checkout_id uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.checkout_check_token(p_checkout_id, p_token);
  if exists (
    select 1 from public.checkout_sessions cs
    where cs.id = p_checkout_id and cs.stripe_session_id is not null
  ) then
    return false;
  end if;
  return public.checkout_close(p_checkout_id, 'failed');
end;
$$;

revoke all on function public.checkout_release(uuid, text) from public;
grant execute on function public.checkout_release(uuid, text) to anon, authenticated;

----------------------------------------------------------------------------
-- checkout_expire_from_stripe (interna): evento checkout.session.expired. Trova la riga aperta per
-- checkout_id (dai metadati della sessione) o per id di sessione Stripe, e la chiude restituendo i punti.
-- La chiama solo il webhook con dbAdmin.
----------------------------------------------------------------------------
create or replace function public.checkout_expire_from_stripe(p_checkout_id uuid, p_stripe_session_id text)
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
  return public.checkout_close(v_id, 'expired');
end;
$$;

revoke all on function public.checkout_expire_from_stripe(uuid, text) from public, anon, authenticated;

----------------------------------------------------------------------------
-- checkout_sweep_stale: chiude le righe 'open' senza sessione Stripe più vecchie di p_older_than
-- (crash o errore tra la transazione di creazione e la sessione) e restituisce i punti, una volta sola.
-- Le righe si bloccano con FOR UPDATE SKIP LOCKED: un collegamento della sessione in corso aspetta,
-- e poi non trova più la riga aperta. Non è concessa a nessun ruolo applicativo: la chiama il cron
-- (src/server/shop/checkout-sweep.admin.ts) con dbAdmin. Per ogni esecuzione chiude al massimo 500 righe.
----------------------------------------------------------------------------
create or replace function public.checkout_sweep_stale(p_older_than interval default interval '15 minutes')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select cs.id
      from public.checkout_sessions cs
     where cs.status = 'open'
       and cs.stripe_session_id is null
       and cs.created_at < now() - p_older_than
     order by cs.created_at
     limit 500
       for update skip locked
  loop
    if public.checkout_close(v_id, 'failed') then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.checkout_sweep_stale(interval) from public, anon, authenticated;
