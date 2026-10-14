-- record_flight_click (usata da /api/go/flight) e arrival_airport di user_constraints (LMP, PNL).
-- Nessuna dipendenza dal seed: utenti, itinerari e subid sono creati nella transazione.
-- Ruoli: anonimo, utente (alice), altro utente (bob).
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');

-- Itinerario di bob (privato) e uno di alice (accessibile solo ad alice).
insert into public.itineraries (id, owner_id, title, days)
values
  ('cccccccc-0000-0000-0000-000000000001', tests.uid('bob'), 'Di bob', 2),
  ('cccccccc-0000-0000-0000-000000000002', tests.uid('alice'), 'Di alice', 2);

----------------------------------------------------------------------------
-- USER_CONSTRAINTS.ARRIVAL_AIRPORT
----------------------------------------------------------------------------
select lives_ok(
  format($$insert into public.user_constraints (user_id, arrival_airport) values (%L, 'LMP') on conflict (user_id) do update set arrival_airport = excluded.arrival_airport$$, tests.uid('alice')),
  'arrival_airport: accetta LMP'
);
select lives_ok(
  format($$insert into public.user_constraints (user_id, arrival_airport) values (%L, 'PNL') on conflict (user_id) do update set arrival_airport = excluded.arrival_airport$$, tests.uid('alice')),
  'arrival_airport: accetta PNL'
);
select throws_ok(
  format($$insert into public.user_constraints (user_id, arrival_airport) values (%L, 'NAP') on conflict (user_id) do update set arrival_airport = excluded.arrival_airport$$, tests.uid('alice')),
  '23514', null, 'arrival_airport: rifiuta un aeroporto fuori dall''elenco'
);

----------------------------------------------------------------------------
-- RECORD_FLIGHT_CLICK
----------------------------------------------------------------------------
-- Anonimo: click valido, registrato con partner travelpayouts, senza offerta né attività.
select tests.as_anon();
select lives_ok(
  $$select public.record_flight_click('flightsub0001', 'flights', 'https://www.aviasales.com/search/MXP1510CTA1?marker=test&sub_id=flightsub0001', '11111111-2222-3333-4444-555555555555')$$,
  'anon: registra un click verso Aviasales'
);
select throws_ok($$select * from public.affiliate_clicks$$, '42501', null, 'anon: non rilegge i click');
select throws_ok(
  $$insert into public.affiliate_clicks (partner, target_url, subid, context) values ('travelpayouts', 'https://www.aviasales.com/x', 'flightsub0099', 'flights')$$,
  '42501', null, 'anon: non inserisce click direttamente'
);

-- Destinazione fuori allowlist: host che somiglia ad Aviasales, http, host nel percorso.
select throws_ok(
  $$select public.record_flight_click('flightsub0002', 'flights', 'https://www.aviasales.com.evil.test/x')$$,
  'P0001', 'target_not_allowed', 'target: host con suffisso estraneo'
);
select throws_ok(
  $$select public.record_flight_click('flightsub0003', 'flights', 'http://www.aviasales.com/search/x')$$,
  'P0001', 'target_not_allowed', 'target: solo https'
);
select throws_ok(
  $$select public.record_flight_click('flightsub0004', 'flights', 'https://evil.test/https://www.aviasales.com/')$$,
  'P0001', 'target_not_allowed', 'target: host consentito solo nel percorso'
);

-- Subid non valido.
select throws_ok(
  $$select public.record_flight_click('corto', 'flights', 'https://www.aviasales.com/search/x')$$,
  'P0001', 'invalid_subid', 'subid: troppo corto'
);
select throws_ok(
  $$select public.record_flight_click('FLIGHTSUB0005', 'flights', 'https://www.aviasales.com/search/x')$$,
  'P0001', 'invalid_subid', 'subid: maiuscole non ammesse'
);

-- Anonymous id e contesto.
select throws_ok(
  $$select public.record_flight_click('flightsub0006', 'flights', 'https://www.aviasales.com/search/x', 'non-uuid')$$,
  'P0001', 'invalid_anon_id', 'anon_id: non è un uuid'
);
select throws_ok(
  $$select public.record_flight_click('flightsub0007', 'hotel', 'https://www.aviasales.com/search/x')$$,
  'P0001', 'invalid_context', 'contesto: fuori dall''elenco'
);

-- Itinerario non accessibile: l'anonimo non lo vede.
select throws_ok(
  $$select public.record_flight_click('flightsub0008', 'itinerary', 'https://www.aviasales.com/search/x', null, 'cccccccc-0000-0000-0000-000000000001')$$,
  'P0001', 'itinerary_not_accessible', 'itinerario: anonimo su itinerario di bob'
);

-- Utente (alice): click con il proprio itinerario.
reset role;
select tests.authenticate_as('alice');
select lives_ok(
  $$select public.record_flight_click('flightsub0010', 'itinerary', 'https://www.aviasales.com/search/MXP1510CTA1?sub_id=flightsub0010', null, 'cccccccc-0000-0000-0000-000000000002')$$,
  'utente: registra un click sul proprio itinerario'
);
select throws_ok(
  $$select public.record_flight_click('flightsub0011', 'itinerary', 'https://www.aviasales.com/search/x', null, 'cccccccc-0000-0000-0000-000000000001')$$,
  'P0001', 'itinerary_not_accessible', 'itinerario: alice su itinerario di bob'
);

reset role;
select results_eq(
  $$select user_id, offer_id, activity_id, partner::text, context, itinerary_id, anon_id from public.affiliate_clicks where subid = 'flightsub0001'$$,
  $$values (null::uuid, null::uuid, null::uuid, 'travelpayouts'::text, 'flights'::text, null::uuid, '11111111-2222-3333-4444-555555555555'::text)$$,
  'anon: click senza utente, senza offerta né attività, partner travelpayouts, contesto flights e anon_id'
);
select is(
  (select user_id from public.affiliate_clicks where subid = 'flightsub0010'),
  tests.uid('alice'),
  'utente: il click è suo, ricavato da auth.uid()'
);
select is(
  (select itinerary_id from public.affiliate_clicks where subid = 'flightsub0010'),
  'cccccccc-0000-0000-0000-000000000002'::uuid,
  'utente: il click riporta l''itinerario'
);
select is(
  (select count(*)::int from public.user_events where user_id = tests.uid('alice') and type = 'affiliate_click'),
  1,
  'utente: registrato anche l''evento affiliate_click'
);
select is(
  (select count(*)::int from public.affiliate_clicks where subid in ('flightsub0002', 'flightsub0003', 'flightsub0004', 'flightsub0008', 'flightsub0011')),
  0,
  'nessuna riga per i click rifiutati'
);

select * from finish();
rollback;
