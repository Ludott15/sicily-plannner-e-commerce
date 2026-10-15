-- affiliate_partners (passo 3.1): colonne leggibili dal client, scrittura solo admin, vincoli;
-- affiliate_partner_config; record_affiliate_click con allowlist e partner attivo;
-- record_vertical_click; rate limit (hit_rate_limit e rate_limit_hits).
-- Nessuna dipendenza dal seed: attività, offerte, itinerari e bucket sono creati nella transazione
-- con prefisso test-/testaff-/testvert-/pgtap-rl-. Le righe base dei partner sono configurazione
-- della migrazione, non dati demo.
-- Ruoli: anonimo, utente (alice), altro utente (bob), admin.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('admin', true);

-- Luogo, attività attiva (con un tag, richiesto dal trigger activities_require_tags) e offerte.
insert into public.places (id, slug, name, province, lat, lng)
values ('aaaaaaaa-0000-0000-0000-00000000f001', 'test-aff-luogo', 'Luogo', 'TP', 38.1, 12.8);
insert into public.activities (id, slug, place_id, title, duration_min, is_active)
values ('bbbbbbbb-0000-0000-0000-00000000f001', 'test-aff-attivita', 'aaaaaaaa-0000-0000-0000-00000000f001', 'Attività', 120, false);
insert into public.activity_interests (activity_id, interest_key, strength)
values ('bbbbbbbb-0000-0000-0000-00000000f001', 'sea', 2);
update public.activities set is_active = true where id = 'bbbbbbbb-0000-0000-0000-00000000f001';

insert into public.activity_offers (id, activity_id, partner, partner_product_id, title, affiliate_url, is_active)
values
  ('dddddddd-0000-0000-0000-00000000f001', 'bbbbbbbb-0000-0000-0000-00000000f001', 'getyourguide', 'testaff-1', 'Gyg', 'https://www.getyourguide.com/s/?q=Test%20Area', true),
  ('dddddddd-0000-0000-0000-00000000f002', 'bbbbbbbb-0000-0000-0000-00000000f001', 'getyourguide', 'testaff-2', 'Userinfo', 'https://www.getyourguide.com@evil.test/x', true),
  ('dddddddd-0000-0000-0000-00000000f003', 'bbbbbbbb-0000-0000-0000-00000000f001', 'getyourguide', 'testaff-3', 'Suffisso', 'https://www.getyourguide.com.evil.test/x', true),
  ('dddddddd-0000-0000-0000-00000000f004', 'bbbbbbbb-0000-0000-0000-00000000f001', 'viator', 'testaff-4', 'Viator', 'https://www.viator.com/searchResults/all?text=Test', true),
  ('dddddddd-0000-0000-0000-00000000f005', 'bbbbbbbb-0000-0000-0000-00000000f001', 'car_rental', 'testaff-5', 'Noleggio', 'https://www.rental-test.example/x', true),
  ('dddddddd-0000-0000-0000-00000000f006', 'bbbbbbbb-0000-0000-0000-00000000f001', 'getyourguide', 'testaff-6', 'Maiuscolo', 'https://WWW.GETYOURGUIDE.COM/x/', true),
  ('dddddddd-0000-0000-0000-00000000f007', 'bbbbbbbb-0000-0000-0000-00000000f001', 'getyourguide', 'testaff-7', 'Porta', 'https://www.getyourguide.com:8443/x', true);

-- Itinerario di bob (privato): l'anonimo non può collegarci un click.
insert into public.itineraries (id, owner_id, title, days)
values ('cccccccc-0000-0000-0000-00000000f001', tests.uid('bob'), 'Di bob', 2);

----------------------------------------------------------------------------
-- ANONIMO: colonne pubbliche, nessuna scrittura
----------------------------------------------------------------------------
select tests.as_anon();
select results_eq(
  $$select partner::text from public.affiliate_partners where partner in ('getyourguide', 'car_rental') order by partner$$,
  $$values ('getyourguide'::text)$$,
  'anonimo: vede solo i partner attivi (car_rental è inattivo)'
);
select throws_ok($$select search_url_template from public.affiliate_partners$$, '42501', null, 'anonimo: template non leggibile');
select throws_ok($$select allowed_hosts from public.affiliate_partners$$, '42501', null, 'anonimo: host non leggibili');
select throws_ok($$select subid_param from public.affiliate_partners$$, '42501', null, 'anonimo: parametro del subid non leggibile');
select throws_ok($$select partner_id_env from public.affiliate_partners$$, '42501', null, 'anonimo: nome della variabile non leggibile');
select throws_ok($$update public.affiliate_partners set name = 'Hack' where partner = 'viator'$$, '42501', null, 'anonimo: non scrive');

select results_eq(
  $$select allowed_hosts from public.affiliate_partner_config('booking')$$,
  $$values (array['www.booking.com']::text[])$$,
  'anonimo: affiliate_partner_config restituisce gli host di booking'
);

----------------------------------------------------------------------------
-- UTENTE (alice): colonne pubbliche, nessuna scrittura
----------------------------------------------------------------------------
select tests.authenticate_as('alice');
select results_eq(
  $$select partner::text from public.affiliate_partners where partner = 'viator'$$,
  $$values ('viator'::text)$$,
  'utente: legge le colonne pubbliche di un partner attivo'
);
select throws_ok($$select search_url_template from public.affiliate_partners$$, '42501', null, 'utente: template non leggibile');
select throws_ok($$select * from public.affiliate_partners$$, '42501', null, 'utente: nemmeno con select *');
select lives_ok($$update public.affiliate_partners set name = 'Hack' where partner = 'viator'$$, 'utente: update senza righe visibili non è errore');
select throws_ok($$update public.affiliate_partners set partner = 'booking' where partner = 'viator'$$, '42501', null, 'utente: la chiave partner non si modifica');

reset role;
select is(
  (select name from public.affiliate_partners where partner = 'viator'),
  'Viator',
  'utente: il nome di Viator non è cambiato'
);

----------------------------------------------------------------------------
-- ADMIN: scrive, vede anche le righe inattive, non legge il template dal client
----------------------------------------------------------------------------
select tests.authenticate_as('admin');
select lives_ok(
  $$update public.affiliate_partners set name = 'Civitatis (test)' where partner = 'civitatis'$$,
  'admin: aggiorna il nome di un partner'
);
select results_eq(
  $$select partner::text from public.affiliate_partners where partner = 'car_rental'$$,
  $$values ('car_rental'::text)$$,
  'admin: vede anche il partner inattivo'
);
select throws_ok($$select allowed_hosts from public.affiliate_partners$$, '42501', null, 'admin dal client: host non leggibili (si legge dal server)');

----------------------------------------------------------------------------
-- VINCOLI (come proprietario della migrazione)
----------------------------------------------------------------------------
reset role;
select throws_ok(
  $$update public.affiliate_partners set allowed_hosts = '{}' where partner = 'civitatis'$$,
  '23514', null, 'vincoli: partner attivo senza host'
);
select throws_ok(
  $$update public.affiliate_partners set subid_param = 'Bad Param' where partner = 'viator'$$,
  '23514', null, 'vincoli: parametro del subid con caratteri non ammessi'
);
select throws_ok(
  $$update public.affiliate_partners set search_url_template = 'http://www.booking.com/x?ss={query}' where partner = 'booking'$$,
  '23514', null, 'vincoli: template non https'
);

----------------------------------------------------------------------------
-- RECORD_AFFILIATE_CLICK: offerte, allowlist, partner attivo
----------------------------------------------------------------------------
select tests.as_anon();
select results_eq(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-00000000f001', 'testaff0000001', 'page', '11111111-2222-3333-4444-555555555555')$$,
  $$values ('https://www.getyourguide.com/s/?q=Test%20Area&cmp=testaff0000001'::text)$$,
  'offerta GYG con host consentito: URL con il subid nel parametro del partner'
);
select results_eq(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-00000000f004', 'testaff0000004', 'page')$$,
  $$values ('https://www.viator.com/searchResults/all?text=Test&campaign=testaff0000004'::text)$$,
  'offerta Viator: parametro campaign dalla tabella'
);
select results_eq(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-00000000f006', 'testaff0000006', 'page')$$,
  $$values ('https://WWW.GETYOURGUIDE.COM/x/?cmp=testaff0000006'::text)$$,
  'offerta con host in maiuscolo: accettata (confronto senza distinzione di maiuscole)'
);
select throws_ok(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-00000000f002', 'testaff0000002', 'page')$$,
  'P0001', 'target_not_allowed', 'offerta con userinfo (user@host): host fuori allowlist'
);
select throws_ok(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-00000000f003', 'testaff0000003', 'page')$$,
  'P0001', 'target_not_allowed', 'offerta con host che ha un suffisso estraneo'
);
select throws_ok(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-00000000f007', 'testaff0000007', 'page')$$,
  'P0001', 'target_not_allowed', 'offerta con porta: host non esatto'
);
select throws_ok(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-00000000f005', 'testaff0000005', 'page')$$,
  'P0001', 'partner_not_active', 'offerta di un partner inattivo (car_rental)'
);
select throws_ok(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-00000000f001', 'corto', 'page')$$,
  'P0001', 'invalid_subid', 'subid troppo corto'
);
select throws_ok(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-00000000f001', 'testaff0000008', 'page', null, 'cccccccc-0000-0000-0000-00000000f001')$$,
  'P0001', 'itinerary_not_accessible', 'anonimo: itinerario di bob'
);

-- Utente: il click è suo e registra l'evento.
reset role;
select tests.authenticate_as('alice');
select lives_ok(
  $$select public.record_affiliate_click('dddddddd-0000-0000-0000-00000000f001', 'testaff0000011', 'page')$$,
  'utente: click su un'' offerta valida'
);

reset role;
select results_eq(
  $$select partner::text, target_url, activity_id, offer_id from public.affiliate_clicks where subid = 'testaff0000001'$$,
  $$values ('getyourguide'::text, 'https://www.getyourguide.com/s/?q=Test%20Area&cmp=testaff0000001'::text, 'bbbbbbbb-0000-0000-0000-00000000f001'::uuid, 'dddddddd-0000-0000-0000-00000000f001'::uuid)$$,
  'click anonimo registrato con attività e offerta'
);
select is(
  (select user_id from public.affiliate_clicks where subid = 'testaff0000011'),
  tests.uid('alice'),
  'click dell''utente: user_id ricavato da auth.uid()'
);
select is(
  (select count(*)::int from public.affiliate_clicks where subid in ('testaff0000002', 'testaff0000003', 'testaff0000005', 'testaff0000007')),
  0,
  'nessuna riga per i click rifiutati'
);

----------------------------------------------------------------------------
-- RECORD_VERTICAL_CLICK: alloggi e noleggi
----------------------------------------------------------------------------
select tests.as_anon();
select results_eq(
  $$select public.record_vertical_click('booking', 'lodging', 'testvert0001', 'page', 'https://www.booking.com/searchresults.html?ss=Cefal%C3%B9&checkin=2026-11-01&checkout=2026-11-03&group_adults=2&aid=test&label=testvert0001', '11111111-2222-3333-4444-555555555555')$$,
  $$values ('testvert0001'::text)$$,
  'anonimo: click valido su Booking (alloggio)'
);
select results_eq(
  $$select public.record_vertical_click('discovercars', 'car', 'testvert0002', 'page', 'https://www.discovercars.com/search?location=PMO&pickup_date=2026-11-01&dropoff_date=2026-11-03&a_aid=test&data1=testvert0002')$$,
  $$values ('testvert0002'::text)$$,
  'anonimo: click valido su DiscoverCars (noleggio)'
);
select throws_ok(
  $$select public.record_vertical_click('car_rental', 'car', 'testvert0003', 'page', 'https://www.rental-test.example/x')$$,
  'P0001', 'partner_not_active', 'partner inattivo'
);
select throws_ok(
  $$select public.record_vertical_click('booking', 'car', 'testvert0004', 'page', 'https://www.booking.com/x')$$,
  'P0001', 'vertical_not_allowed', 'verticale non ammessa dal partner (Booking non fa noleggi)'
);
select throws_ok(
  $$select public.record_vertical_click('booking', 'hotel', 'testvert0005', 'page', 'https://www.booking.com/x')$$,
  'P0001', 'vertical_not_allowed', 'verticale fuori dall''elenco'
);
select throws_ok(
  $$select public.record_vertical_click('discovercars', 'car', 'testvert0006', 'page', 'https://www.booking.com/x')$$,
  'P0001', 'target_not_allowed', 'host di un altro partner'
);
select throws_ok(
  $$select public.record_vertical_click('booking', 'lodging', 'testvert0007', 'page', 'http://www.booking.com/x')$$,
  'P0001', 'target_not_allowed', 'solo https'
);
select throws_ok(
  $$select public.record_vertical_click('booking', 'lodging', 'testvert0008', 'page', 'https://evil.test/https://www.booking.com/x')$$,
  'P0001', 'target_not_allowed', 'host consentito solo nel percorso'
);
select throws_ok(
  $$select public.record_vertical_click('booking', 'lodging', 'testvert0009', 'page', 'https://www.booking.com@evil.test/x')$$,
  'P0001', 'target_not_allowed', 'userinfo nel URL'
);
select throws_ok(
  $$select public.record_vertical_click('booking', 'lodging', 'testvert0010', 'page', 'https://www.booking.com:443/x')$$,
  'P0001', 'target_not_allowed', 'porta nel URL: host non esatto'
);
select throws_ok(
  $$select public.record_vertical_click('booking', 'lodging', 'Corto', 'page', 'https://www.booking.com/x')$$,
  'P0001', 'invalid_subid', 'subid non valido'
);
select throws_ok(
  $$select public.record_vertical_click('booking', 'lodging', 'testvert0011', 'hotel', 'https://www.booking.com/x')$$,
  'P0001', 'invalid_context', 'contesto fuori dall''elenco'
);
select throws_ok(
  $$select public.record_vertical_click('booking', 'lodging', 'testvert0012', 'page', 'https://www.booking.com/x', 'non-uuid')$$,
  'P0001', 'invalid_anon_id', 'anon_id non è un uuid'
);
select throws_ok(
  $$select public.record_vertical_click('booking', 'lodging', 'testvert0013', 'itinerary', 'https://www.booking.com/x', null, 'cccccccc-0000-0000-0000-00000000f001')$$,
  'P0001', 'itinerary_not_accessible', 'anonimo: itinerario di bob'
);

reset role;
select tests.authenticate_as('alice');
select lives_ok(
  $$select public.record_vertical_click('discovercars', 'car', 'testvert0020', 'page', 'https://www.discovercars.com/search?x=1')$$,
  'utente: click valido senza itinerario'
);

reset role;
select is(
  (select count(*)::int from public.affiliate_clicks where subid in ('testvert0001', 'testvert0002') and offer_id is null and activity_id is null),
  2,
  'click verticali registrati senza offerta né attività'
);
select is(
  (select user_id from public.affiliate_clicks where subid = 'testvert0020'),
  tests.uid('alice'),
  'click verticale dell''utente: user_id da auth.uid()'
);
select is(
  (select count(*)::int from public.affiliate_clicks where subid in ('testvert0003', 'testvert0004', 'testvert0006', 'testvert0007', 'testvert0008', 'testvert0009', 'testvert0010', 'testvert0013')),
  0,
  'nessuna riga per i click verticali rifiutati'
);

----------------------------------------------------------------------------
-- RATE LIMIT
----------------------------------------------------------------------------
select tests.as_anon();
select is(public.hit_rate_limit('pgtap-rl-bucket-01', 3, 3600), true, 'rate limit: primo hit consentito');
select is(public.hit_rate_limit('pgtap-rl-bucket-01', 3, 3600), true, 'rate limit: secondo hit consentito');
select is(public.hit_rate_limit('pgtap-rl-bucket-01', 3, 3600), true, 'rate limit: terzo hit consentito (al limite)');
select is(public.hit_rate_limit('pgtap-rl-bucket-01', 3, 3600), false, 'rate limit: quarto hit oltre il limite');
select throws_ok($$select * from public.rate_limit_hits$$, '42501', null, 'anonimo: rate_limit_hits non leggibile');
select throws_ok(
  $$insert into public.rate_limit_hits (bucket, window_start, hits) values ('pgtap-rl-bucket-99', now(), 0)$$,
  '42501', null, 'anonimo: rate_limit_hits non scrivibile'
);
select throws_ok($$select public.hit_rate_limit('corto', 3, 3600)$$, 'P0001', 'invalid_rate_limit', 'rate limit: bucket con formato errato');
select throws_ok($$select public.hit_rate_limit('pgtap-rl-bucket-02', 0, 3600)$$, 'P0001', 'invalid_rate_limit', 'rate limit: limite a zero');
select throws_ok($$select public.hit_rate_limit('pgtap-rl-bucket-02', 3, 0)$$, 'P0001', 'invalid_rate_limit', 'rate limit: finestra a zero');

select tests.authenticate_as('alice');
select is(public.hit_rate_limit('pgtap-rl-bucket-03', 1, 3600), true, 'rate limit: utente, primo hit');
select is(public.hit_rate_limit('pgtap-rl-bucket-03', 1, 3600), false, 'rate limit: utente, oltre il limite');

reset role;
select is(
  (select hits from public.rate_limit_hits where bucket = 'pgtap-rl-bucket-01'),
  4,
  'rate limit: il contatore conta anche gli hit oltre il limite'
);

select * from finish();
rollback;
