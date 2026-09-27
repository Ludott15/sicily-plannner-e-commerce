-- Shop, AI e audit: RLS e immutabilità di admin_audit_log.

----------------------------------------------------------------------------
-- IMMUTABILITÀ: admin_audit_log
----------------------------------------------------------------------------

-- Nessun update né delete, per nessun ruolo (postgres compreso). Unica eccezione:
-- la foreign key che imposta actor_id a null quando si elimina l'account dell'admin
-- (arriva da un trigger di foreign key, quindi pg_trigger_depth() > 1) e non tocca
-- nessun'altra colonna.
create or replace function public.admin_audit_log_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
    and pg_trigger_depth() > 1
    and old.actor_id is not null
    and new.actor_id is null
    and (new.id, new.action, new.entity, new.entity_id, new.diff, new.created_at)
      is not distinct from (old.id, old.action, old.entity, old.entity_id, old.diff, old.created_at)
  then
    return new;
  end if;
  raise exception 'admin_audit_log_immutable' using errcode = 'P0001';
end;
$$;

create trigger admin_audit_log_immutable
  before update or delete on public.admin_audit_log
  for each row execute function public.admin_audit_log_immutable();

create trigger admin_audit_log_no_truncate
  before truncate on public.admin_audit_log
  for each statement execute function public.prevent_mutation();

----------------------------------------------------------------------------
-- RLS
----------------------------------------------------------------------------

alter table public.producers enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_shipments enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

revoke all on table public.producers, public.products, public.orders, public.order_items,
  public.order_shipments, public.admin_audit_log, public.chat_sessions, public.chat_messages
  from anon, authenticated;

-- producers: solo admin (contengono email e partita IVA)
grant select, insert, update, delete on table public.producers to authenticated;

create policy producers_select_admin on public.producers
  for select to authenticated
  using ((select public.is_admin()));

create policy producers_insert_admin on public.producers
  for insert to authenticated
  with check ((select public.is_admin()));

create policy producers_update_admin on public.producers
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy producers_delete_admin on public.producers
  for delete to authenticated
  using ((select public.is_admin()));

-- products: pubblici se attivi, l'admin vede e scrive tutto
grant select on table public.products to anon, authenticated;
grant insert, update, delete on table public.products to authenticated;

create policy products_select_active_anon on public.products
  for select to anon
  using (is_active);

create policy products_select_active_or_admin on public.products
  for select to authenticated
  using (is_active or (select public.is_admin()));

create policy products_insert_admin on public.products
  for insert to authenticated
  with check ((select public.is_admin()));

create policy products_update_admin on public.products
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy products_delete_admin on public.products
  for delete to authenticated
  using ((select public.is_admin()));

-- orders, order_items: il proprietario legge; scrive solo il webhook Stripe (dbAdmin)
grant select on table public.orders, public.order_items to authenticated;

create policy orders_select_own on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy order_items_select_own on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and o.user_id = (select auth.uid())
  ));

-- order_shipments: il proprietario dell'ordine vede corriere e tracking, mai token_hash.
-- La conferma del produttore passa da una funzione server con il token.
grant select (order_id, producer_id, carrier, tracking_number, shipped_at, created_at)
  on table public.order_shipments to authenticated;

create policy order_shipments_select_own on public.order_shipments
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and o.user_id = (select auth.uid())
  ));

-- admin_audit_log: lettura admin, scrittura solo server
grant select on table public.admin_audit_log to authenticated;

create policy admin_audit_log_select_admin on public.admin_audit_log
  for select to authenticated
  using ((select public.is_admin()));

-- chat_sessions: il proprietario crea, rinomina ed elimina; l'itinerario collegato
-- deve essere accessibile a lui
grant select, delete on table public.chat_sessions to authenticated;
grant insert (id, user_id, itinerary_id, title) on table public.chat_sessions to authenticated;
grant update (title) on table public.chat_sessions to authenticated;

create policy chat_sessions_select_own on public.chat_sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy chat_sessions_insert_own on public.chat_sessions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (itinerary_id is null or public.can_access_itinerary(itinerary_id))
  );

create policy chat_sessions_update_own on public.chat_sessions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy chat_sessions_delete_own on public.chat_sessions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- chat_messages: il proprietario della sessione legge; scrive solo il server (/api/chat)
grant select on table public.chat_messages to authenticated;

create policy chat_messages_select_own on public.chat_messages
  for select to authenticated
  using (exists (
    select 1 from public.chat_sessions s
    where s.id = session_id and s.user_id = (select auth.uid())
  ));
