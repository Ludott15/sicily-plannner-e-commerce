-- Ordini (passo 7.3): numero d'ordine, grant per colonna di orders e order_items, funzioni per l'ospite e
-- per la pagina di esito. Ruoli: anonimo, proprietario (alice), altro utente (bob), ospite (token), admin.
-- Le funzioni SECURITY DEFINER sono le uniche strade per l'ospite: qui si prova che non danno nulla senza
-- il token giusto e che non espongono costo, fornitore o id di Stripe.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('admin', true);

-- Catalogo e ordini preparati come postgres (lo scrive il webhook con dbAdmin).
insert into public.suppliers (id, name, kind, contact_email)
values ('a2222222-aaaa-0000-0000-000000000001', 'Fornitore ordini di prova', 'manual', 'fornitore-ordini@example.com');
insert into public.producers (id, slug, name, email, is_public)
values ('21111111-aaaa-0000-0000-000000000001', 'test-ordini-produttore', 'Produttore di prova', 'produttore-ordini@example.com', true);
insert into public.products (id, slug, producer_id, supplier_id, supplier_sku, title, category, price_cents, vat_rate, is_active, allergens_declared, cost_cents, lead_time_days)
values ('31111111-aaaa-0000-0000-000000000001', 'test-ordini-crema', '21111111-aaaa-0000-0000-000000000001',
        'a2222222-aaaa-0000-0000-000000000001', 'SKU-ORD-1', 'Crema di prova', 'dolci', 1200, 10, false, true, 500, 3);

-- Ordine di alice (account, spedito) e ordine di un ospite con token. Hash del token: sha256('token-ospite-prova').
insert into public.orders (id, user_id, email, status, subtotal_cents, discount_cents, shipping_cents, total_cents,
  stripe_session_id, payment_intent_id, supplier_status, needs_review, paid_amount_cents, shipping_address,
  carrier, tracking_number, problem_note, shipped_at)
values
  ('41111111-aaaa-0000-0000-000000000001', tests.uid('alice'), 'alice-ordini@example.com', 'shipped', 2400, 0, 0, 2400,
   'cs_test_ord_alice', 'pi_test_ord_alice', 'shipped', false, 2400,
   '{"name":"Alice Prova","line1":"Via di prova 1","postalCode":"90100","city":"Palermo","country":"IT","phone":"+390000000001"}',
   'BRT', 'TRK-ALICE', 'nota interna riservata', now()),
  ('41111111-aaaa-0000-0000-000000000002', null, 'ospite-ordini@example.com', 'paid', 1890, 0, 0, 1890,
   'cs_test_ord_guest', 'pi_test_ord_guest', 'forwarded', false, 1890,
   '{"name":"Ospite Prova","line1":"Via di prova 2","postalCode":"90100","city":"Palermo","country":"IT"}',
   null, null, null, null);
update public.orders set access_token_hash = encode(sha256(convert_to('token-ospite-prova', 'UTF8')), 'hex')
 where id = '41111111-aaaa-0000-0000-000000000002';

insert into public.order_items (order_id, product_id, producer_id, supplier_id, supplier_sku, title_snapshot, quantity, unit_price_cents, vat_rate, cost_cents_snapshot)
values
  ('41111111-aaaa-0000-0000-000000000001', '31111111-aaaa-0000-0000-000000000001', '21111111-aaaa-0000-0000-000000000001',
   'a2222222-aaaa-0000-0000-000000000001', 'SKU-ORD-1', 'Crema di prova', 2, 1200, 10, 500),
  ('41111111-aaaa-0000-0000-000000000002', '31111111-aaaa-0000-0000-000000000001', '21111111-aaaa-0000-0000-000000000001',
   'a2222222-aaaa-0000-0000-000000000001', 'SKU-ORD-1', 'Crema di prova', 1, 1200, 10, 500);

-- Numeri d'ordine letti ora (come postgres): gli anonimi non leggono la tabella orders.
select set_config('tests.guest_number', (select order_number from public.orders where id = '41111111-aaaa-0000-0000-000000000002'), false);
select set_config('tests.alice_number', (select order_number from public.orders where id = '41111111-aaaa-0000-0000-000000000001'), false);

----------------------------------------------------------------------------
-- NUMERO D'ORDINE: lo assegna il database, formato ISU-AAAA-NNNNNN
----------------------------------------------------------------------------
select matches(current_setting('tests.guest_number'), '^ISU-[0-9]{4}-[0-9]{6}$', 'numero d''ordine: formato ISU-AAAA-NNNNNN');
select isnt(current_setting('tests.guest_number'), current_setting('tests.alice_number'), 'numero d''ordine: due ordini hanno numeri diversi');
select ok(
  not has_function_privilege('anon', 'public.next_order_number()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.next_order_number()', 'EXECUTE'),
  'numero d''ordine: la funzione non è eseguibile dai ruoli applicativi'
);

----------------------------------------------------------------------------
-- PROPRIETARIO: solo le colonne del cliente, solo le proprie righe
----------------------------------------------------------------------------
select tests.authenticate_as('alice');
select results_eq(
  $$select status::text, total_cents, carrier, tracking_number from public.orders$$,
  $$values ('shipped'::text, 2400, 'BRT'::text, 'TRK-ALICE'::text)$$,
  'proprietario: legge le colonne del cliente del proprio ordine'
);
select is((select count(*)::int from public.orders), 1, 'proprietario: vede solo il proprio ordine');
select is((select count(*)::int from public.order_items), 1, 'proprietario: vede solo le righe del proprio ordine');
select throws_ok($$select stripe_session_id from public.orders$$, '42501', null, 'proprietario: niente id di sessione Stripe');
select throws_ok($$select payment_intent_id from public.orders$$, '42501', null, 'proprietario: niente id di pagamento');
select throws_ok($$select access_token_hash from public.orders$$, '42501', null, 'proprietario: niente hash del token ospite');
select throws_ok($$select supplier_status from public.orders$$, '42501', null, 'proprietario: niente stato del fornitore');
select throws_ok($$select needs_review from public.orders$$, '42501', null, 'proprietario: niente revisione interna');
select throws_ok($$select problem_note from public.orders$$, '42501', null, 'proprietario: niente note interne');
select throws_ok($$select paid_amount_cents from public.orders$$, '42501', null, 'proprietario: niente importo incassato');
select throws_ok($$select checkout_session_id from public.orders$$, '42501', null, 'proprietario: niente riga di checkout');
select throws_ok($$select cost_cents_snapshot from public.order_items$$, '42501', null, 'proprietario: niente costo d''acquisto');
select throws_ok($$select supplier_id from public.order_items$$, '42501', null, 'proprietario: niente fornitore');
select throws_ok($$select supplier_sku from public.order_items$$, '42501', null, 'proprietario: niente codice del fornitore');
select results_eq(
  $$select title_snapshot, quantity, unit_price_cents, vat_rate::int from public.order_items$$,
  $$values ('Crema di prova'::text, 2, 1200, 10)$$,
  'proprietario: legge titolo, quantità, prezzo e IVA della riga'
);
select throws_ok($$update public.orders set status = 'delivered'$$, '42501', null, 'proprietario: non cambia lo stato');
select throws_ok($$update public.orders set needs_review = false$$, '42501', null, 'proprietario: non tocca la revisione');
select throws_ok($$delete from public.orders$$, '42501', null, 'proprietario: non cancella ordini');
select throws_ok(
  $$insert into public.orders (email, subtotal_cents, total_cents, stripe_session_id) values ('x@example.com', 1, 1, 'cs_test_x_ord')$$,
  '42501', null, 'proprietario: non crea ordini dal client'
);
select throws_ok($$update public.order_items set unit_price_cents = 0$$, '42501', null, 'proprietario: non modifica le righe');

----------------------------------------------------------------------------
-- ALTRO UTENTE: nessun ordine, né dell'account di alice né dell'ospite
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('bob');
select is_empty($$select 1 from public.orders$$, 'altro utente: non vede gli ordini di alice né quelli degli ospiti');
select is_empty($$select 1 from public.order_items$$, 'altro utente: non vede le righe');

----------------------------------------------------------------------------
-- ADMIN dal client: nessuna lettura né scrittura (il pannello usa dbAdmin lato server)
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('admin');
select is_empty($$select 1 from public.orders$$, 'admin dal client: nessun ordine');
select throws_ok($$update public.orders set status = 'refunded'$$, '42501', null, 'admin dal client: non modifica ordini');

----------------------------------------------------------------------------
-- ANONIMO: nessuna lettura diretta delle tabelle, solo le funzioni dell'ospite e dell'esito
----------------------------------------------------------------------------
reset role;
select tests.as_anon();
select throws_ok($$select * from public.orders$$, '42501', null, 'anon: non legge gli ordini');
select throws_ok($$select * from public.order_items$$, '42501', null, 'anon: non legge le righe');
select is(public.order_guest_token_hash('ISU-2099-000000'), null::text, 'anon: nessun hash per un numero inesistente');
select is(public.order_guest_token_hash(current_setting('tests.alice_number')), null::text, 'anon: nessun hash per un ordine di account');
select isnt(public.order_guest_token_hash(current_setting('tests.guest_number')), null::text, 'anon: l''hash del token dell''ospite è leggibile (il server lo confronta a tempo costante)');

-- Dettaglio ospite: solo con l'hash giusto, e senza costo, fornitore o id di Stripe.
select isnt(
  public.order_guest_detail(current_setting('tests.guest_number'), encode(sha256(convert_to('token-ospite-prova', 'UTF8')), 'hex')),
  null::jsonb,
  'ospite: dettaglio con il token giusto'
);
select is(
  public.order_guest_detail(current_setting('tests.guest_number'), encode(sha256(convert_to('token-sbagliato', 'UTF8')), 'hex')),
  null::jsonb,
  'ospite: token sbagliato, nessun dato'
);
select is(
  public.order_guest_detail(current_setting('tests.guest_number'), null),
  null::jsonb,
  'ospite: token nullo, nessun dato'
);
select is(
  public.order_guest_detail(current_setting('tests.alice_number'), encode(sha256(convert_to('token-ospite-prova', 'UTF8')), 'hex')),
  null::jsonb,
  'ospite: un ordine di account non si apre con un token'
);
select ok(
  not ((public.order_guest_detail(current_setting('tests.guest_number'), encode(sha256(convert_to('token-ospite-prova', 'UTF8')), 'hex'))) ? 'stripe_session_id'),
  'ospite: il dettaglio non contiene l''id di Stripe'
);
select ok(
  not ((public.order_guest_detail(current_setting('tests.guest_number'), encode(sha256(convert_to('token-ospite-prova', 'UTF8')), 'hex')) -> 'items' -> 0) ? 'cost_cents_snapshot'),
  'ospite: nelle righe non c''è il costo d''acquisto'
);
select ok(
  not ((public.order_guest_detail(current_setting('tests.guest_number'), encode(sha256(convert_to('token-ospite-prova', 'UTF8')), 'hex')) -> 'items' -> 0) ? 'supplier_id'),
  'ospite: nelle righe non c''è il fornitore'
);

-- Pagina di esito: stato dalla sessione, senza email né indirizzo.
select results_eq(
  $$select public.order_for_checkout_session('cs_test_ord_guest') ->> 'status'$$,
  $$values ('paid'::text)$$,
  'esito: stato dell''ordine dalla sessione di Stripe'
);
select ok(
  not (public.order_for_checkout_session('cs_test_ord_guest') ? 'email'),
  'esito: nessuna email nella risposta'
);
select is(public.order_for_checkout_session('cs_test_inesistente'), null::jsonb, 'esito: sessione senza ordine, null');

----------------------------------------------------------------------------
-- GRANT DI ESECUZIONE: aperte ad anon solo le funzioni dell'ospite e dell'esito
----------------------------------------------------------------------------
reset role;
select ok(
  has_function_privilege('anon', 'public.order_guest_token_hash(text)', 'EXECUTE')
    and has_function_privilege('anon', 'public.order_guest_detail(text, text)', 'EXECUTE')
    and has_function_privilege('anon', 'public.order_for_checkout_session(text)', 'EXECUTE'),
  'grant: le funzioni dell''ospite e dell''esito sono eseguibili da anon'
);
select ok(
  not has_function_privilege('anon', 'public.checkout_fail_from_stripe(uuid, text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.checkout_fail_from_stripe(uuid, text)', 'EXECUTE'),
  'grant: checkout_fail_from_stripe non è eseguibile dai ruoli applicativi'
);

select * from finish();
rollback;
