-- Shop: producers, products, orders, order_items, order_shipments.
-- Ruoli: anonimo, proprietario dell'ordine (alice), altro utente (bob), admin.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('admin', true);

-- Catalogo e ordine preparati come postgres (lo scrive il webhook Stripe con dbAdmin).
insert into public.producers (id, name, email)
values ('11111111-aaaa-0000-0000-000000000001', 'Pistacchi di Bronte', 'ordini@example.com');
insert into public.products (id, slug, producer_id, title, price_cents, weight_g, is_active)
values
  ('22222222-aaaa-0000-0000-000000000001', 'test-crema', '11111111-aaaa-0000-0000-000000000001', 'Crema di pistacchio', 1200, 200, true),
  ('22222222-aaaa-0000-0000-000000000002', 'test-bozza', '11111111-aaaa-0000-0000-000000000001', 'Bozza', 900, 150, false);
insert into public.orders (id, user_id, email, status, subtotal_cents, discount_cents, shipping_cents, total_cents, stripe_session_id)
values
  ('33333333-aaaa-0000-0000-000000000001', tests.uid('alice'), 'alice@example.com', 'paid', 2400, 0, 690, 3090, 'cs_test_alice'),
  ('33333333-aaaa-0000-0000-000000000002', null, 'ospite@example.com', 'paid', 1200, 0, 690, 1890, 'cs_test_guest');
insert into public.order_items (order_id, product_id, producer_id, quantity, unit_price_cents)
values ('33333333-aaaa-0000-0000-000000000001', '22222222-aaaa-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001', 2, 1200);
insert into public.order_shipments (order_id, producer_id, token_hash, carrier, tracking_number)
values ('33333333-aaaa-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001',
  encode(sha256('tok-spedizione'::bytea), 'hex'), 'BRT', 'TRK123');

----------------------------------------------------------------------------
-- VINCOLI
----------------------------------------------------------------------------
select throws_ok(
  $$insert into public.orders (email, subtotal_cents, shipping_cents, total_cents, stripe_session_id) values ('x@example.com', 1000, 500, 1000, 'cs_test_x')$$,
  '23514', null, 'orders: il totale deve essere subtotale - sconto + spedizione'
);
select throws_ok(
  $$insert into public.orders (email, subtotal_cents, discount_cents, total_cents, stripe_session_id) values ('x@example.com', 1000, 200, 800, 'cs_test_y')$$,
  '23514', null, 'orders: sconto massimo 15% del subtotale'
);
select throws_ok(
  $$insert into public.orders (email, subtotal_cents, total_cents, stripe_session_id) values ('x@example.com', 1000, 1000, 'cs_test_alice')$$,
  '23505', null, 'orders: stripe_session_id univoco (idempotenza del webhook)'
);

----------------------------------------------------------------------------
-- PROPRIETARIO DELL'ORDINE
----------------------------------------------------------------------------
select tests.authenticate_as('alice');
select results_eq($$select stripe_session_id from public.orders$$, $$values ('cs_test_alice')$$, 'proprietario: vede solo il proprio ordine');
select results_eq($$select quantity from public.order_items$$, $$values (2)$$, 'proprietario: vede le righe del proprio ordine');
select results_eq(
  $$select carrier, tracking_number from public.order_shipments$$,
  $$values ('BRT', 'TRK123')$$,
  'proprietario: vede corriere e tracking'
);
select throws_ok($$select token_hash from public.order_shipments$$, '42501', null, 'proprietario: non legge il token del produttore');
select throws_ok(
  format($$insert into public.orders (user_id, email, subtotal_cents, total_cents, stripe_session_id) values (%L, 'a@example.com', 0, 0, 'cs_test_fake')$$, tests.uid('alice')),
  '42501', null, 'proprietario: non crea ordini dal client'
);
select throws_ok($$update public.orders set status = 'delivered'$$, '42501', null, 'proprietario: non cambia lo stato dell''ordine');
select throws_ok($$delete from public.orders$$, '42501', null, 'proprietario: non cancella ordini');
select throws_ok($$update public.order_items set unit_price_cents = 0$$, '42501', null, 'proprietario: non modifica le righe');
select throws_ok($$update public.order_shipments set shipped_at = now()$$, '42501', null, 'proprietario: non conferma spedizioni');

----------------------------------------------------------------------------
-- ALTRO UTENTE
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('bob');
select is_empty($$select 1 from public.orders$$, 'altro utente: non vede gli ordini di alice né quelli degli ospiti');
select is_empty($$select 1 from public.order_items$$, 'altro utente: non vede le righe');
select is_empty($$select order_id from public.order_shipments$$, 'altro utente: non vede le spedizioni');
select is_empty($$select 1 from public.producers$$, 'altro utente: non vede i produttori');
select results_eq(
  $$select slug from public.products where slug like 'test-%'$$,
  $$values ('test-crema')$$,
  'altro utente: vede solo i prodotti attivi'
);
select throws_ok(
  $$insert into public.products (slug, producer_id, title, price_cents, weight_g) values ('x', '11111111-aaaa-0000-0000-000000000001', 'x', 1, 1)$$,
  '42501', null, 'altro utente: non crea prodotti'
);
select throws_ok(
  $$insert into public.producers (name, email) values ('x', 'x@example.com')$$,
  '42501', null, 'altro utente: non crea produttori'
);
update public.products set price_cents = 1 where slug = 'test-crema';
reset role;
select is((select price_cents from public.products where slug = 'test-crema'), 1200, 'altro utente: update di un prodotto senza effetto');

----------------------------------------------------------------------------
-- ADMIN
----------------------------------------------------------------------------
select tests.authenticate_as('admin');
select results_eq(
  $$select slug from public.products where slug like 'test-%' order by slug$$,
  $$values ('test-bozza'), ('test-crema')$$,
  'admin: vede anche i prodotti inattivi'
);
select isnt_empty($$select 1 from public.producers$$, 'admin: vede i produttori');
select lives_ok(
  $$insert into public.producers (name, email, lead_time_days) values ('Cantina', 'cantina@example.com', 5)$$,
  'admin: crea un produttore'
);
select lives_ok(
  $$update public.products set is_active = true where slug = 'test-bozza'$$,
  'admin: attiva un prodotto'
);
select is_empty($$select 1 from public.orders$$, 'admin: non legge gli ordini dal client (usa dbAdmin lato server)');
select throws_ok($$update public.orders set status = 'refunded'$$, '42501', null, 'admin: non modifica ordini dal client');

----------------------------------------------------------------------------
-- ANONIMO
----------------------------------------------------------------------------
reset role;
select tests.as_anon();
select results_eq(
  $$select slug from public.products where slug like 'test-%' order by slug$$,
  $$values ('test-bozza'), ('test-crema')$$,
  'anon: vede i prodotti attivi'
);
select throws_ok($$select * from public.producers$$, '42501', null, 'anon: non legge i produttori');
select throws_ok($$select * from public.orders$$, '42501', null, 'anon: non legge gli ordini');
select throws_ok($$select * from public.order_items$$, '42501', null, 'anon: non legge le righe');
select throws_ok($$select order_id from public.order_shipments$$, '42501', null, 'anon: non legge le spedizioni');

----------------------------------------------------------------------------
-- ELIMINAZIONE DELL'ACCOUNT: gli ordini restano per obblighi fiscali
----------------------------------------------------------------------------
reset role;
select lives_ok(
  format($$delete from auth.users where id = %L$$, tests.uid('alice')),
  'eliminazione account: riuscita anche con ordini'
);
select results_eq(
  $$select user_id, email, total_cents from public.orders where id = '33333333-aaaa-0000-0000-000000000001'$$,
  $$values (null::uuid, 'alice@example.com', 3090)$$,
  'eliminazione account: l''ordine esiste ancora con user_id null'
);
select results_eq(
  $$select count(*)::int from public.order_items where order_id = '33333333-aaaa-0000-0000-000000000001'$$,
  $$values (1)$$,
  'eliminazione account: le righe dell''ordine restano'
);
select isnt_empty(
  $$select 1 from public.order_shipments where order_id = '33333333-aaaa-0000-0000-000000000001'$$,
  'eliminazione account: le spedizioni restano'
);

select * from finish();
rollback;
