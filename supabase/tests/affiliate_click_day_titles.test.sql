-- record_affiliate_click (usata da /api/go/[id]) e itineraries.day_titles.
-- Ruoli: anonimo, utente (alice), altro utente (bob), admin.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('admin', true);

insert into public.places (id, slug, name, province, lat, lng)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'test-zingaro', 'Zingaro', 'TP', 38.1, 12.8);
insert into public.activities (id, slug, place_id, title, duration_min, is_active, partner, partner_product_id, affiliate_url)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'test-prenotabile', 'aaaaaaaa-0000-0000-0000-000000000001', 'Prenotabile', 180, true, 'getyourguide', 'T-1', 'https://www.getyourguide.com/test-1/'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'test-inattiva', 'aaaaaaaa-0000-0000-0000-000000000001', 'Inattiva', 60, false, 'getyourguide', 'T-2', 'https://www.getyourguide.com/test-2/'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'test-senza-link', 'aaaaaaaa-0000-0000-0000-000000000001', 'Senza link', 60, true, 'internal', null, null);
insert into public.activity_interests (activity_id, interest_key, strength)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'sea', 2), ('bbbbbbbb-0000-0000-0000-000000000003', 'sea', 1);
insert into public.itineraries (id, owner_id, title, days)
values ('cccccccc-0000-0000-0000-000000000001', tests.uid('bob'), 'Di bob', 2);

----------------------------------------------------------------------------
-- RECORD_AFFILIATE_CLICK
----------------------------------------------------------------------------
select tests.as_anon();
select lives_ok(
  $$select public.record_affiliate_click('bbbbbbbb-0000-0000-0000-000000000001', 'anonsubid0001', 'https://www.getyourguide.com/test-1/?cmp=anonsubid0001', 'page', '11111111-2222-3333-4444-555555555555')$$,
  'anon: registra un click su un''attività prenotabile'
);
select throws_ok($$select * from public.affiliate_clicks$$, '42501', null, 'anon: non rilegge i click');
reset role;
select results_eq(
  $$select user_id, partner::text, context, anon_id from public.affiliate_clicks where subid = 'anonsubid0001'$$,
  $$values (null::uuid, 'getyourguide', 'page', '11111111-2222-3333-4444-555555555555')$$,
  'anon: click senza utente, con partner dell''attività e identificativo anonimo'
);

select tests.authenticate_as('alice');
select lives_ok(
  $$select public.record_affiliate_click('bbbbbbbb-0000-0000-0000-000000000001', 'alicesubid001', 'https://www.getyourguide.com/test-1/?cmp=alicesubid001', 'itinerary')$$,
  'utente: registra un click'
);
reset role;
select is(
  (select user_id from public.affiliate_clicks where subid = 'alicesubid001'),
  tests.uid('alice'),
  'utente: il click è suo, ricavato da auth.uid()'
);
select is(
  (select count(*)::int from public.user_events where user_id = tests.uid('alice') and type = 'affiliate_click'),
  1,
  'utente: registrato anche l''evento affiliate_click'
);

select tests.authenticate_as('alice');
select throws_ok(
  $$select public.record_affiliate_click('bbbbbbbb-0000-0000-0000-000000000001', 'evilsubid0001', 'https://evil.example/?u=https://www.getyourguide.com/test-1/', 'page')$$,
  'P0001', 'target_mismatch', 'nessun URL diverso da quello del catalogo'
);
select throws_ok(
  $$select public.record_affiliate_click('bbbbbbbb-0000-0000-0000-000000000002', 'inactsubid001', 'https://www.getyourguide.com/test-2/', 'page')$$,
  'P0001', 'activity_not_bookable', 'attività inattiva: nessun click'
);
select throws_ok(
  $$select public.record_affiliate_click('bbbbbbbb-0000-0000-0000-000000000003', 'nolinksubid01', 'https://x.example/', 'page')$$,
  'P0001', 'activity_not_bookable', 'attività senza link affiliato: nessun click'
);
select throws_ok(
  $$select public.record_affiliate_click('bbbbbbbb-0000-0000-0000-000000000001', 'CORTO', 'https://www.getyourguide.com/test-1/', 'page')$$,
  'P0001', 'invalid_subid', 'subid con formato non valido'
);
select throws_ok(
  $$select public.record_affiliate_click('bbbbbbbb-0000-0000-0000-000000000001', 'alicesubid001', 'https://www.getyourguide.com/test-1/', 'page')$$,
  '23505', null, 'subid univoco'
);
select throws_ok(
  $$select public.record_affiliate_click('bbbbbbbb-0000-0000-0000-000000000001', 'itinsubid0001', 'https://www.getyourguide.com/test-1/', 'itinerary', null, 'cccccccc-0000-0000-0000-000000000001')$$,
  'P0001', 'itinerary_not_accessible', 'non si collega un click all''itinerario di un altro'
);
select throws_ok(
  $$select public.record_affiliate_click('bbbbbbbb-0000-0000-0000-000000000001', 'ctxsubid00001', 'https://www.getyourguide.com/test-1/', 'altro')$$,
  '23514', null, 'contesto tra quelli previsti'
);
select is_empty($$select 1 from public.affiliate_clicks$$, 'utente: non rilegge i click, nemmeno i propri');

reset role;
select tests.authenticate_as('admin');
select results_eq(
  $$select count(*)::int from public.affiliate_clicks where subid in ('anonsubid0001', 'alicesubid001')$$,
  $$values (2)$$,
  'admin: legge i click registrati'
);

----------------------------------------------------------------------------
-- DAY_TITLES
----------------------------------------------------------------------------
reset role;
insert into public.itineraries (id, owner_id, title, slug, is_template, days, day_titles)
values ('cccccccc-0000-0000-0000-000000000002', null, 'Template', 'test-template', true, 3, '{"Noto e costa","Siracusa"}');

select tests.as_anon();
select is(
  (select day_titles from public.itineraries where id = 'cccccccc-0000-0000-0000-000000000002'),
  '{"Noto e costa","Siracusa"}'::text[],
  'anon: legge i titoli dei giorni di un itinerario pronto'
);

reset role;
select tests.authenticate_as('alice');
select lives_ok(
  format($$insert into public.itineraries (id, owner_id, title, days, day_titles, template_id) values ('cccccccc-0000-0000-0000-000000000003', %L, 'Copia', 3, '{"Noto e costa","Siracusa"}', 'cccccccc-0000-0000-0000-000000000002')$$, tests.uid('alice')),
  'proprietario: crea un itinerario ereditando i titoli dei giorni'
);
select lives_ok(
  $$update public.itineraries set day_titles = '{"Noto al mattino","Siracusa"}' where id = 'cccccccc-0000-0000-0000-000000000003'$$,
  'proprietario: cambia il titolo di un giorno'
);
select throws_ok(
  $$update public.itineraries set day_titles = '{"a","b","c","d"}' where id = 'cccccccc-0000-0000-0000-000000000003'$$,
  '23514', null, 'al massimo un titolo per giorno'
);
update public.itineraries set day_titles = '{"hack"}' where id = 'cccccccc-0000-0000-0000-000000000002';

reset role;
select tests.authenticate_as('bob');
update public.itineraries set day_titles = '{"hack"}' where id = 'cccccccc-0000-0000-0000-000000000003';

reset role;
select is(
  (select day_titles from public.itineraries where id = 'cccccccc-0000-0000-0000-000000000003'),
  '{"Noto al mattino","Siracusa"}'::text[],
  'altro utente: non cambia i titoli dei giorni di alice'
);
select is(
  (select day_titles from public.itineraries where id = 'cccccccc-0000-0000-0000-000000000002'),
  '{"Noto e costa","Siracusa"}'::text[],
  'proprietario: non cambia i titoli di un itinerario pronto'
);

select tests.authenticate_as('admin');
select lives_ok(
  $$update public.itineraries set day_titles = '{"Noto e costa","Siracusa","Modica e Ragusa"}' where id = 'cccccccc-0000-0000-0000-000000000002'$$,
  'admin: scrive i titoli dei giorni di un itinerario pronto'
);

select * from finish();
rollback;
