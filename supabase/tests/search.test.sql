-- Ricerca interna (passo 11.2): search_site, record_search_miss e RLS di search_misses.
-- Si coprono anonimo, utente, altro utente non necessario, admin. Nessun dato dal seed: tutto ha il
-- prefisso test- e viene annullato dal rollback finale.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('user');
select tests.create_user('admin', true);

insert into public.places (id, slug, name, province, lat, lng, is_active)
values
  ('aaaaaaaa-0000-0000-0000-00000000c001', 'test-marettimo', 'Marettimo Test', 'TP', 37.9, 12.07, true),
  ('aaaaaaaa-0000-0000-0000-00000000c002', 'test-panarea', 'Pànarea Test', 'ME', 38.6, 15.07, true),
  ('aaaaaaaa-0000-0000-0000-00000000c003', 'test-luogo-chiuso', 'Luogo Chiuso Test', 'TP', 37.9, 12.07, false);

insert into public.activities (id, slug, place_id, title, duration_min, is_active)
values
  ('bbbbbbbb-0000-0000-0000-00000000d001', 'test-grotta-marettimo', 'aaaaaaaa-0000-0000-0000-00000000c001', 'Grotta Marettimo Test', 90, false),
  ('bbbbbbbb-0000-0000-0000-00000000d002', 'test-escursione-chiusa', 'aaaaaaaa-0000-0000-0000-00000000c001', 'Escursione chiusa Marettimo Test', 60, false);
insert into public.activity_interests (activity_id, interest_key, strength)
values ('bbbbbbbb-0000-0000-0000-00000000d001', 'sea', 2);
update public.activities set is_active = true where id = 'bbbbbbbb-0000-0000-0000-00000000d001';

insert into public.itineraries (id, owner_id, title, slug, is_template, days)
values
  ('cccccccc-0000-0000-0000-00000000e001', null, 'Itinerario Marettimo Test', 'test-itinerario-marettimo', true, 3),
  ('cccccccc-0000-0000-0000-00000000e002', null, 'Bozza Marettimo Test', null, true, 2);
insert into public.itineraries (id, owner_id, title, days, is_template)
values
  ('cccccccc-0000-0000-0000-00000000e003', tests.uid('user'), 'Personale Marettimo Test', 2, false);

insert into public.guides (id, slug, title_it, body_it, author_name, status, published_at)
values
  ('dddddddd-0000-0000-0000-00000000f001', 'test-guida-marettimo', 'Guida Marettimo Test', 'Testo.', 'Autore di prova', 'published', now()),
  ('dddddddd-0000-0000-0000-00000000f002', 'test-bozza-marettimo', 'Guida bozza Marettimo Test', 'Testo.', 'Autore di prova', 'draft', null);

----------------------------------------------------------------------------
-- Ricerca come anonimo
----------------------------------------------------------------------------
select tests.as_anon();

select isnt_empty(
  $$select 1 from public.search_site('Marettimo Test', 'it', 20) where kind = 'place' and slug = 'test-marettimo'$$,
  'anon: trova un luogo attivo per nome'
);
select isnt_empty(
  $$select 1 from public.search_site('Grotta Marettimo Test', 'it', 20) where kind = 'activity' and slug = 'test-grotta-marettimo'$$,
  'anon: trova un''attività attiva per titolo'
);
select is_empty(
  $$select 1 from public.search_site('Escursione chiusa Marettimo Test', 'it', 20) where slug = 'test-escursione-chiusa'$$,
  'anon: l''attività inattiva non compare'
);
select is_empty(
  $$select 1 from public.search_site('Luogo Chiuso Test', 'it', 20) where slug = 'test-luogo-chiuso'$$,
  'anon: il luogo inattivo non compare'
);
select isnt_empty(
  $$select 1 from public.search_site('Itinerario Marettimo Test', 'it', 20) where kind = 'itinerary' and slug = 'test-itinerario-marettimo'$$,
  'anon: trova un itinerario pronto (modello con slug)'
);
select is_empty(
  $$select 1 from public.search_site('Bozza Marettimo Test', 'it', 20) where title = 'Bozza Marettimo Test'$$,
  'anon: il modello senza slug (bozza) non compare'
);
select is_empty(
  $$select 1 from public.search_site('Personale Marettimo Test', 'it', 20) where title = 'Personale Marettimo Test'$$,
  'anon: l''itinerario personale non compare'
);
select isnt_empty(
  $$select 1 from public.search_site('Guida Marettimo Test', 'it', 20) where kind = 'guide' and slug = 'test-guida-marettimo'$$,
  'anon: trova una guida pubblicata'
);
select is_empty(
  $$select 1 from public.search_site('Guida bozza Marettimo Test', 'it', 20) where title = 'Guida bozza Marettimo Test'$$,
  'anon: la guida in bozza non compare'
);
select isnt_empty(
  $$select 1 from public.search_site('Maretimo Test', 'it', 20) where kind = 'place' and slug = 'test-marettimo'$$,
  'anon: tollera un errore di battitura (Maretimo trova Marettimo)'
);
select isnt_empty(
  $$select 1 from public.search_site('Panarea Test', 'it', 20) where slug = 'test-panarea'$$,
  'anon: trova senza accento un nome con accento (Panarea trova Pànarea)'
);
select isnt_empty(
  $$select 1 from public.search_site('Pànarea Test', 'it', 20) where slug = 'test-panarea'$$,
  'anon: trova con l''accento il nome con accento'
);
select is(
  (select count(*)::int from public.search_site('a', 'it', 20)),
  0,
  'anon: una query di una lettera non produce risultati'
);
select is(
  (select count(*)::int from public.search_site('   ', 'it', 20)),
  0,
  'anon: una query di soli spazi non produce risultati'
);
select throws_ok(
  $$insert into public.search_misses (query_norm) values ('test-diretto')$$,
  '42501', null,
  'anon: non scrive direttamente in search_misses'
);
select throws_ok(
  $$select 1 from public.search_misses$$,
  '42501', null,
  'anon: non legge search_misses'
);
select lives_ok(
  $$select public.record_search_miss('Parola inesistente Test')$$,
  'anon: può registrare una ricerca senza risultati'
);

----------------------------------------------------------------------------
-- Utente: registra ricerche senza risultati, ma non le legge
----------------------------------------------------------------------------
reset role;
select set_config('tests.miss_key', 'parola-' || replace(gen_random_uuid()::text, '-', ''), true);

select tests.as_anon();
select public.record_search_miss(current_setting('tests.miss_key'));

reset role;
select tests.authenticate_as('user');

select lives_ok(
  $$select public.record_search_miss(upper(current_setting('tests.miss_key')) || '   ')$$,
  'utente: registra la stessa ricerca con maiuscole e spazi'
);
select is_empty(
  $$select 1 from public.search_misses$$,
  'utente: non legge search_misses (la RLS lo riserva all''admin)'
);
select throws_ok(
  $$insert into public.search_misses (query_norm) values ('test-utente')$$,
  '42501', null,
  'utente: non scrive direttamente in search_misses'
);

reset role;
select is(
  (select misses from public.search_misses where query_norm = current_setting('tests.miss_key')),
  2,
  'la ricerca senza risultati conta le volte, normalizzata (maiuscole e spazi non creano righe nuove)'
);

----------------------------------------------------------------------------
-- Admin: legge le ricerche senza risultati
----------------------------------------------------------------------------
select tests.authenticate_as('admin');
select isnt_empty(
  $$select 1 from public.search_misses where query_norm = current_setting('tests.miss_key')$$,
  'admin: legge le ricerche senza risultati'
);

select * from finish();
rollback;
