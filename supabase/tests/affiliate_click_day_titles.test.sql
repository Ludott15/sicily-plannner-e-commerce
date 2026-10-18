-- record_affiliate_click (usata da /api/go/[id], su un'offerta di activity_offers: costruisce e restituisce
-- l'URL del partner) e itineraries.day_titles.
-- Ruoli: anonimo, utente (alice), altro utente (bob), admin.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
-- Profilazione (passo 8.2): alice ha dato il consenso, bob no.
insert into public.user_consents (user_id, kind, granted, text_version) values (tests.uid('alice'), 'profiling', true, 'profiling-test-v1');
select tests.create_user('admin', true);

insert into public.places (id, slug, name, province, lat, lng)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'test-zingaro', 'Zingaro', 'TP', 38.1, 12.8);
insert into public.activities (id, slug, place_id, title, duration_min, is_active)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'test-prenotabile', 'aaaaaaaa-0000-0000-0000-000000000001', 'Prenotabile', 180, false),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'test-inattiva', 'aaaaaaaa-0000-0000-0000-000000000001', 'Inattiva', 60, false);
insert into public.activity_interests (activity_id, interest_key, strength)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'sea', 2);
update public.activities set is_active = true where id = 'bbbbbbbb-0000-0000-0000-000000000001';
-- Offerte: 1 attiva su attività attiva, 2 attiva su attività inattiva, 3 inattiva su attività attiva.
insert into public.activity_offers (id, activity_id, partner, partner_product_id, title, affiliate_url, is_active)
values
  ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'getyourguide', 'T-1', 'Offerta', 'https://www.getyourguide.com/test-1/', true),
  ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'getyourguide', 'T-2', 'Su inattiva', 'https://www.getyourguide.com/test-2/', true),
  ('dddddddd-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001', 'viator', 'T-3', 'Offerta spenta', 'https://www.viator.com/test-3/', false),
  ('dddddddd-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000001', 'getyourguide', 'T-4', 'Con parametri', 'https://www.getyourguide.com/s/?q=Zingaro&partner_id=ABC', true),
  ('dddddddd-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000001', 'viator', 'T-5', 'Viator', 'https://www.viator.com/tours/x', true),
  ('dddddddd-0000-0000-0000-000000000006', 'bbbbbbbb-0000-0000-0000-000000000001', 'getyourguide', 'T-6', 'Con frammento', 'https://www.getyourguide.com/a#b', true);
insert into public.itineraries (id, owner_id, title, days)
values ('cccccccc-0000-0000-0000-000000000001', tests.uid('bob'), 'Di bob', 2);

----------------------------------------------------------------------------
-- RECORD_AFFILIATE_CLICK
----------------------------------------------------------------------------
select tests.as_anon();
select lives_ok(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-000000000001', 'anonsubid0001', 'page', '11111111-2222-3333-4444-555555555555')$$,
  'anon: registra un click su un''offerta attiva'
);
select throws_ok($$select * from public.affiliate_clicks$$, '42501', null, 'anon: non rilegge i click');
reset role;
select results_eq(
  $$select user_id, offer_id, activity_id, partner::text, context, anon_id from public.affiliate_clicks where subid = 'anonsubid0001'$$,
  $$values (null::uuid, 'dddddddd-0000-0000-0000-000000000001'::uuid, 'bbbbbbbb-0000-0000-0000-000000000001'::uuid, 'getyourguide', 'page', '11111111-2222-3333-4444-555555555555')$$,
  'anon: click senza utente, con offerta, attività e partner dell''offerta e identificativo anonimo'
);

select tests.authenticate_as('alice');
select lives_ok(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-000000000001', 'alicesubid001', 'itinerary')$$,
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

-- Gemella senza consenso: il click si registra in affiliate_clicks, ma nessun evento di profilazione.
select tests.authenticate_as('bob');
select lives_ok(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-000000000001', 'bobsubid00001', 'itinerary')$$,
  'senza consenso: il click di bob si registra'
);
reset role;
select is(
  (select count(*)::int from public.affiliate_clicks where subid = 'bobsubid00001'), 1,
  'senza consenso: il click affiliato resta in affiliate_clicks'
);
select is(
  (select count(*)::int from public.user_events where user_id = tests.uid('bob')), 0,
  'senza consenso alla profilazione: nessun evento affiliate_click'
);

select tests.authenticate_as('alice');
select is(
  public.record_affiliate_click('dddddddd-0000-0000-0000-000000000001', 'urlsubid00001', 'page'),
  'https://www.getyourguide.com/test-1/?cmp=urlsubid00001',
  'l''URL restituito è quello dell''offerta con il parametro del partner: nessun URL dal chiamante'
);
select is(
  public.record_affiliate_click('dddddddd-0000-0000-0000-000000000004', 'urlsubid00002', 'page'),
  'https://www.getyourguide.com/s/?q=Zingaro&partner_id=ABC&cmp=urlsubid00002',
  'URL con parametri: il subid si aggiunge con &, senza toccare l''URL di base'
);
select is(
  public.record_affiliate_click('dddddddd-0000-0000-0000-000000000005', 'urlsubid00003', 'page'),
  'https://www.viator.com/tours/x?campaign=urlsubid00003',
  'Viator: parametro campaign'
);
select is(
  public.record_affiliate_click('dddddddd-0000-0000-0000-000000000006', 'urlsubid00004', 'page'),
  'https://www.getyourguide.com/a#b',
  'URL con frammento: resta com''è'
);
select is(
  (select target_url from public.affiliate_clicks where subid = 'urlsubid00002'),
  null,
  'utente: non rilegge l''URL registrato'
);
select throws_ok(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-000000000002', 'inactsubid001', 'page')$$,
  'P0001', 'offer_not_bookable', 'offerta di un''attività inattiva: nessun click'
);
select throws_ok(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-000000000003', 'offsubid00001', 'page')$$,
  'P0001', 'offer_not_bookable', 'offerta inattiva: nessun click'
);
select throws_ok(
  $$select public.record_affiliate_click('bbbbbbbb-0000-0000-0000-000000000001', 'actsubid00001', 'page')$$,
  'P0001', 'offer_not_bookable', 'l''id di un''attività non è un''offerta: nessun click'
);
select throws_ok(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-000000000001', 'CORTO', 'page')$$,
  'P0001', 'invalid_subid', 'subid con formato non valido'
);
select throws_ok(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-000000000001', 'alicesubid001', 'page')$$,
  '23505', null, 'subid univoco'
);
select throws_ok(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-000000000001', 'itinsubid0001', 'itinerary', null, 'cccccccc-0000-0000-0000-000000000001')$$,
  'P0001', 'itinerary_not_accessible', 'non si collega un click all''itinerario di un altro'
);
select throws_ok(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-000000000001', 'ctxsubid00001', 'altro')$$,
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
