-- Conversioni affiliate (passo 3.3): external_id, source, status e idempotenza sul vincolo
-- (partner, external_id). Lettura solo admin, scrittura solo server (dbAdmin).
-- Ruoli: anonimo, utente che ha generato il click (alice), altro utente (bob), admin.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('admin', true);

-- Il server registra un click e una conversione collegata.
insert into public.affiliate_clicks (user_id, partner, target_url, subid, context)
values (tests.uid('alice'), 'getyourguide', 'https://www.getyourguide.com/x', 'conv-test-sub-1', 'page');
insert into public.affiliate_conversions (partner, subid, external_id, amount_eur, commission_eur, status, reported_at, source)
values ('getyourguide', 'conv-test-sub-1', 'conv-test-ext-1', 120.00, 9.60, 'approved', now(), 'csv');

-- VINCOLI
select throws_ok(
  $$insert into public.affiliate_conversions (partner, subid, external_id, status, reported_at, source) values ('getyourguide', 'conv-test-sub-2', 'conv-test-ext-1', 'approved', now(), 'csv')$$,
  '23505', null, 'conversioni: (partner, external_id) univoco'
);
select lives_ok(
  $$insert into public.affiliate_conversions (partner, subid, external_id, status, reported_at, source) values ('viator', 'conv-test-sub-2', 'conv-test-ext-1', 'approved', now(), 'csv')$$,
  'conversioni: lo stesso external_id con un altro partner è ammesso'
);
select throws_ok(
  $$insert into public.affiliate_conversions (partner, subid, external_id, status, reported_at, source) values ('getyourguide', 'conv-test-sub-3', 'conv-test-ext-3', 'rimborsata', now(), 'csv')$$,
  '23514', null, 'conversioni: stato solo tra quelli previsti'
);
select throws_ok(
  $$insert into public.affiliate_conversions (partner, subid, external_id, status, reported_at, source) values ('getyourguide', 'conv-test-sub-3', 'conv-test-ext-3', 'approved', now(), 'manuale')$$,
  '23514', null, 'conversioni: origine solo csv o api'
);
select throws_ok(
  $$insert into public.affiliate_conversions (partner, subid, external_id, status, reported_at, source) values ('getyourguide', 'conv-test-sub-3', '', 'approved', now(), 'csv')$$,
  '23514', null, 'conversioni: external_id non vuoto'
);
select throws_ok(
  $$insert into public.affiliate_conversions (partner, subid, external_id, status, reported_at, source) values ('getyourguide', 'conv-test-sub-3', repeat('x', 121), 'approved', now(), 'csv')$$,
  '23514', null, 'conversioni: external_id al massimo 120 caratteri'
);
select throws_ok(
  $$insert into public.affiliate_conversions (partner, subid, external_id, status, reported_at, source) values ('getyourguide', 'conv-test-sub-3', null, 'approved', now(), 'csv')$$,
  '23502', null, 'conversioni: external_id obbligatorio'
);

-- ADMIN: legge, non scrive dal client
select tests.authenticate_as('admin');
select isnt_empty($$select 1 from public.affiliate_conversions where external_id = 'conv-test-ext-1'$$, 'admin: legge le conversioni');
select throws_ok(
  $$insert into public.affiliate_conversions (partner, subid, external_id, status, reported_at, source) values ('viator', 'conv-test-sub-4', 'conv-test-ext-4', 'approved', now(), 'csv')$$,
  '42501', null, 'admin: non inserisce conversioni dal client'
);
select throws_ok($$update public.affiliate_conversions set status = 'paid'$$, '42501', null, 'admin: non modifica conversioni dal client');
select throws_ok($$delete from public.affiliate_conversions$$, '42501', null, 'admin: non cancella conversioni dal client');

-- PROPRIETARIO DEL CLICK: nessun accesso
reset role;
select tests.authenticate_as('alice');
select is_empty($$select 1 from public.affiliate_conversions$$, 'proprietario del click: non legge le conversioni');

-- ALTRO UTENTE: nessun accesso
reset role;
select tests.authenticate_as('bob');
select is_empty($$select 1 from public.affiliate_conversions$$, 'altro utente: non legge le conversioni');
select throws_ok(
  $$update public.affiliate_conversions set commission_eur = 0$$,
  '42501', null, 'altro utente: non modifica le conversioni'
);

-- ANONIMO
reset role;
select tests.as_anon();
select throws_ok($$select * from public.affiliate_conversions$$, '42501', null, 'anon: non legge le conversioni');

select * from finish();
rollback;
