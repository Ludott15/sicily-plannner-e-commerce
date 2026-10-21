-- Tratte stradali tra luoghi (mappa degli itinerari): lettura pubblica, nessuna scrittura dal client,
-- vincoli di coppia, distanza, durata, sorgente e geometria, cascata alla cancellazione di un luogo.
-- I luoghi sono creati nel test (int-…), senza dipendenza dal seed.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('user');
select tests.create_user('other');
select tests.create_user('admin', true);

insert into public.places (id, slug, name, province, lat, lng) values
  ('dddddddd-0000-0000-0000-0000000000a1', 'int-leg-a', 'Int A', 'PA', 38.10, 13.30),
  ('dddddddd-0000-0000-0000-0000000000a2', 'int-leg-b', 'Int B', 'PA', 38.20, 13.40),
  ('dddddddd-0000-0000-0000-0000000000a3', 'int-leg-c', 'Int C', 'PA', 38.15, 13.35);
insert into public.place_legs (from_place_id, to_place_id, distance_m, duration_s, geometry) values
  ('dddddddd-0000-0000-0000-0000000000a1', 'dddddddd-0000-0000-0000-0000000000a2', 18400, 1500, '[[13.3,38.1],[13.35,38.13],[13.4,38.2]]'),
  ('dddddddd-0000-0000-0000-0000000000a2', 'dddddddd-0000-0000-0000-0000000000a1', 18500, 1520, '[[13.4,38.2],[13.3,38.1]]'),
  ('dddddddd-0000-0000-0000-0000000000a1', 'dddddddd-0000-0000-0000-0000000000a3', 9000, 700, '[[13.3,38.1],[13.35,38.15]]');

----------------------------------------------------------------------------
-- VINCOLI E CASCATA (come ruolo di default, proprietario delle tabelle)
----------------------------------------------------------------------------
select throws_ok(
  $$insert into public.place_legs (from_place_id, to_place_id, distance_m, duration_s, geometry) values ('dddddddd-0000-0000-0000-0000000000a1', 'dddddddd-0000-0000-0000-0000000000a1', 0, 0, '[[13.3,38.1],[13.4,38.2]]')$$,
  '23514', null,
  'stesso luogo da e a: non si scrive'
);
select throws_ok(
  $$insert into public.place_legs (from_place_id, to_place_id, distance_m, duration_s, geometry) values ('dddddddd-0000-0000-0000-0000000000a3', 'dddddddd-0000-0000-0000-0000000000a2', -1, 0, '[[13.3,38.1],[13.4,38.2]]')$$,
  '23514', null,
  'distanza negativa non vale'
);
select throws_ok(
  $$insert into public.place_legs (from_place_id, to_place_id, distance_m, duration_s, geometry) values ('dddddddd-0000-0000-0000-0000000000a3', 'dddddddd-0000-0000-0000-0000000000a2', 100, -1, '[[13.3,38.1],[13.4,38.2]]')$$,
  '23514', null,
  'durata negativa non vale'
);
select throws_ok(
  $$insert into public.place_legs (from_place_id, to_place_id, distance_m, duration_s, geometry, source) values ('dddddddd-0000-0000-0000-0000000000a3', 'dddddddd-0000-0000-0000-0000000000a2', 100, 10, '[[13.3,38.1],[13.4,38.2]]', 'google')$$,
  '23514', null,
  'sorgente diversa da osrm non vale'
);
select throws_ok(
  $$insert into public.place_legs (from_place_id, to_place_id, distance_m, duration_s, geometry) values ('dddddddd-0000-0000-0000-0000000000a3', 'dddddddd-0000-0000-0000-0000000000a2', 100, 10, '[[13.3,38.1]]')$$,
  '23514', null,
  'geometria con un solo punto non vale'
);
select throws_ok(
  $$insert into public.place_legs (from_place_id, to_place_id, distance_m, duration_s, geometry) values ('dddddddd-0000-0000-0000-0000000000a3', 'dddddddd-0000-0000-0000-0000000000a2', 100, 10, '{"type":"LineString"}')$$,
  '23514', null,
  'geometria che non è un array non vale'
);
select throws_ok(
  $$insert into public.place_legs (from_place_id, to_place_id, distance_m, duration_s, geometry) values ('dddddddd-0000-0000-0000-0000000000a3', 'dddddddd-0000-0000-0000-0000000000a2', 100, 10, (select jsonb_agg(jsonb_build_array(13.3, 38.1)) from generate_series(1, 401)))$$,
  '23514', null,
  'geometria oltre 400 punti non vale'
);
select throws_ok(
  $$insert into public.place_legs (from_place_id, to_place_id, distance_m, duration_s, geometry) values ('dddddddd-0000-0000-0000-0000000000a1', 'dddddddd-0000-0000-0000-0000000000a2', 100, 10, '[[13.3,38.1],[13.4,38.2]]')$$,
  '23505', null,
  'una sola riga per coppia ordinata'
);
select lives_ok(
  $$insert into public.place_legs (from_place_id, to_place_id, distance_m, duration_s, geometry) values ('dddddddd-0000-0000-0000-0000000000a3', 'dddddddd-0000-0000-0000-0000000000a1', 9100, 720, '[[13.35,38.15],[13.3,38.1]]')$$,
  'la coppia inversa è una riga a parte'
);
select lives_ok(
  $$delete from public.places where slug = 'int-leg-c'$$,
  'cancellazione di un luogo di prova'
);
select is(
  (select count(*)::int from public.place_legs where from_place_id = 'dddddddd-0000-0000-0000-0000000000a3' or to_place_id = 'dddddddd-0000-0000-0000-0000000000a3'),
  0,
  'cascata: cancellando il luogo si cancellano le sue tratte, in entrambe le direzioni'
);
select is(
  (select count(*)::int from public.place_legs where from_place_id = 'dddddddd-0000-0000-0000-0000000000a1' and to_place_id = 'dddddddd-0000-0000-0000-0000000000a2'),
  1,
  'cascata: le altre tratte restano'
);

----------------------------------------------------------------------------
-- PRIVILEGI (nessun grant di scrittura ad anon e authenticated)
----------------------------------------------------------------------------
select ok(
  has_column_privilege('anon', 'public.place_legs', 'geometry', 'select'),
  'anon: ha il grant di lettura sulle colonne'
);
select ok(
  not has_table_privilege('anon', 'public.place_legs', 'insert, update, delete'),
  'anon: nessun grant di scrittura sulla tabella'
);
select ok(
  not has_table_privilege('authenticated', 'public.place_legs', 'insert, update, delete'),
  'authenticated: nessun grant di scrittura sulla tabella'
);

----------------------------------------------------------------------------
-- ANONIMO
----------------------------------------------------------------------------
select tests.as_anon();

select isnt_empty(
  $$select 1 from public.place_legs where from_place_id = 'dddddddd-0000-0000-0000-0000000000a1' and to_place_id = 'dddddddd-0000-0000-0000-0000000000a2' and distance_m = 18400$$,
  'anon: legge le tratte'
);
select throws_ok(
  $$insert into public.place_legs (from_place_id, to_place_id, distance_m, duration_s, geometry) values ('dddddddd-0000-0000-0000-0000000000a2', 'dddddddd-0000-0000-0000-0000000000a1', 1, 1, '[[13.3,38.1],[13.4,38.2]]')$$,
  '42501', null,
  'anon: non inserisce'
);
select throws_ok($$update public.place_legs set distance_m = 1$$, '42501', null, 'anon: non modifica');
select throws_ok($$delete from public.place_legs$$, '42501', null, 'anon: non cancella');

----------------------------------------------------------------------------
-- UTENTE
----------------------------------------------------------------------------
select tests.authenticate_as('user');

select isnt_empty(
  $$select 1 from public.place_legs where duration_s = 1500$$,
  'utente: legge le tratte'
);
select throws_ok(
  $$insert into public.place_legs (from_place_id, to_place_id, distance_m, duration_s, geometry) values ('dddddddd-0000-0000-0000-0000000000a2', 'dddddddd-0000-0000-0000-0000000000a1', 1, 1, '[[13.3,38.1],[13.4,38.2]]')$$,
  '42501', null,
  'utente: non inserisce'
);
select throws_ok($$update public.place_legs set distance_m = 1$$, '42501', null, 'utente: non modifica');
select throws_ok($$delete from public.place_legs$$, '42501', null, 'utente: non cancella');

----------------------------------------------------------------------------
-- ALTRO UTENTE
----------------------------------------------------------------------------
select tests.authenticate_as('other');

select isnt_empty(
  $$select 1 from public.place_legs where duration_s = 1520$$,
  'altro utente: legge le tratte pubbliche'
);
select throws_ok(
  $$insert into public.place_legs (from_place_id, to_place_id, distance_m, duration_s, geometry) values ('dddddddd-0000-0000-0000-0000000000a2', 'dddddddd-0000-0000-0000-0000000000a1', 1, 1, '[[13.3,38.1],[13.4,38.2]]')$$,
  '42501', null,
  'altro utente: non inserisce'
);
select throws_ok($$update public.place_legs set distance_m = 1$$, '42501', null, 'altro utente: non modifica');
select throws_ok($$delete from public.place_legs$$, '42501', null, 'altro utente: non cancella');

----------------------------------------------------------------------------
-- ADMIN VIA CLIENT (la scrittura passa da dbAdmin, non dal client)
----------------------------------------------------------------------------
select tests.authenticate_as('admin');

select isnt_empty(
  $$select 1 from public.place_legs where duration_s = 1500$$,
  'admin: legge le tratte'
);
select throws_ok(
  $$insert into public.place_legs (from_place_id, to_place_id, distance_m, duration_s, geometry) values ('dddddddd-0000-0000-0000-0000000000a2', 'dddddddd-0000-0000-0000-0000000000a1', 1, 1, '[[13.3,38.1],[13.4,38.2]]')$$,
  '42501', null,
  'admin via client: non inserisce'
);
select throws_ok($$update public.place_legs set distance_m = 1$$, '42501', null, 'admin via client: non modifica');
select throws_ok($$delete from public.place_legs$$, '42501', null, 'admin via client: non cancella');

select * from finish();
rollback;
