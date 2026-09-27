-- Affiliati: affiliate_clicks, affiliate_conversions.
-- Lettura solo admin, scrittura solo server (ruolo postgres / dbAdmin).
-- Ruoli: anonimo, utente che ha generato il click (alice), altro utente (bob), admin.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('admin', true);

-- Il server registra click e conversioni.
insert into public.affiliate_clicks (user_id, partner, target_url, subid, context)
values (tests.uid('alice'), 'getyourguide', 'https://www.getyourguide.com/x', 'test-sub-1', 'page');
insert into public.affiliate_conversions (partner, subid, amount_eur, commission_eur, status, reported_at)
values ('getyourguide', 'test-sub-1', 120.00, 9.60, 'approved', now());

select throws_ok(
  $$insert into public.affiliate_clicks (partner, target_url, subid, context) values ('viator', 'https://x', 'test-sub-1', 'page')$$,
  '23505', null, 'affiliate_clicks: subid univoco'
);
select throws_ok(
  $$insert into public.affiliate_clicks (partner, target_url, subid, context) values ('viator', 'javascript:alert(1)', 'test-sub-2', 'page')$$,
  '23514', null, 'affiliate_clicks: solo URL https'
);
select throws_ok(
  $$insert into public.affiliate_clicks (partner, target_url, subid, context) values ('viator', 'https://x', 'test-sub-3', 'altro')$$,
  '23514', null, 'affiliate_clicks: contesto tra quelli previsti'
);

-- ADMIN: legge, non scrive dal client
select tests.authenticate_as('admin');
select isnt_empty($$select 1 from public.affiliate_clicks where subid = 'test-sub-1'$$, 'admin: legge i click');
select isnt_empty($$select 1 from public.affiliate_conversions where subid = 'test-sub-1'$$, 'admin: legge le conversioni');
select throws_ok(
  $$insert into public.affiliate_clicks (partner, target_url, subid, context) values ('viator', 'https://x', 'test-sub-4', 'page')$$,
  '42501', null, 'admin: non inserisce click dal client'
);
select throws_ok($$update public.affiliate_conversions set commission_eur = 0$$, '42501', null, 'admin: non modifica conversioni dal client');
select throws_ok($$delete from public.affiliate_clicks$$, '42501', null, 'admin: non cancella click dal client');

-- UTENTE CHE HA GENERATO IL CLICK: nessun accesso
reset role;
select tests.authenticate_as('alice');
select is_empty($$select 1 from public.affiliate_clicks$$, 'proprietario del click: non legge i click, nemmeno i propri');
select is_empty($$select 1 from public.affiliate_conversions$$, 'proprietario del click: non legge le conversioni');
select throws_ok(
  format($$insert into public.affiliate_clicks (user_id, partner, target_url, subid, context) values (%L, 'viator', 'https://x', 'test-sub-5', 'page')$$, tests.uid('alice')),
  '42501', null, 'proprietario del click: non inserisce click'
);

-- ALTRO UTENTE
reset role;
select tests.authenticate_as('bob');
select is_empty($$select 1 from public.affiliate_clicks$$, 'altro utente: non legge i click');
select is_empty($$select 1 from public.affiliate_conversions$$, 'altro utente: non legge le conversioni');
select throws_ok(
  $$insert into public.affiliate_conversions (partner, subid, status, reported_at) values ('viator', 'x', 'approved', now())$$,
  '42501', null, 'altro utente: non inserisce conversioni'
);

-- ANONIMO
reset role;
select tests.as_anon();
select throws_ok($$select * from public.affiliate_clicks$$, '42501', null, 'anon: non legge i click');
select throws_ok($$select * from public.affiliate_conversions$$, '42501', null, 'anon: non legge le conversioni');
select throws_ok(
  $$insert into public.affiliate_clicks (partner, target_url, subid, context, anon_id) values ('viator', 'https://x', 'test-sub-6', 'page', 'a1')$$,
  '42501', null, 'anon: non inserisce click'
);

select * from finish();
rollback;
