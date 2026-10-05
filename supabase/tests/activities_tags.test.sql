-- Un'attività senza tag non può essere attivata (constraint trigger differiti).
-- I test forzano il controllo con `set constraints ... immediate`: altrimenti scatterebbe
-- solo al commit, che qui non avviene (rollback finale).
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('admin', true);

insert into public.places (id, slug, name, province, lat, lng)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'test-siracusa', 'Siracusa', 'SR', 37.07, 15.29);

set constraints all immediate;

----------------------------------------------------------------------------
-- ADMIN dal client
----------------------------------------------------------------------------
select tests.authenticate_as('admin');

select throws_ok(
  $$insert into public.activities (slug, place_id, title, duration_min, is_active) values ('test-senza-tag', 'aaaaaaaa-0000-0000-0000-000000000001', 'Senza tag', 60, true)$$,
  'P0001', 'activity_without_tags', 'admin: non crea un''attività attiva senza tag'
);
select lives_ok(
  $$insert into public.activities (id, slug, place_id, title, duration_min) values ('bbbbbbbb-0000-0000-0000-000000000001', 'test-bozza', 'aaaaaaaa-0000-0000-0000-000000000001', 'Bozza', 60)$$,
  'admin: crea un''attività senza tag, inattiva per default'
);
select is(
  (select is_active from public.activities where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  false,
  'default: una nuova attività nasce inattiva'
);
select throws_ok(
  $$update public.activities set is_active = true where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  'P0001', 'activity_without_tags', 'admin: non attiva un''attività senza tag'
);
select lives_ok(
  $$insert into public.activity_interests (activity_id, interest_key, strength) values
    ('bbbbbbbb-0000-0000-0000-000000000001', 'history_archaeology', 3),
    ('bbbbbbbb-0000-0000-0000-000000000001', 'art', 2)$$,
  'admin: aggiunge i tag'
);
select lives_ok(
  $$update public.activities set is_active = true where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  'admin: attiva un''attività con tag'
);
select lives_ok(
  $$delete from public.activity_interests where activity_id = 'bbbbbbbb-0000-0000-0000-000000000001' and interest_key = 'art'$$,
  'admin: rimuove un tag se ne resta almeno uno'
);
select throws_ok(
  $$delete from public.activity_interests where activity_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  'P0001', 'activity_without_tags', 'admin: non rimuove l''ultimo tag di un''attività attiva'
);
select lives_ok(
  $$update public.activities set is_active = false where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  'admin: disattiva l''attività'
);
select lives_ok(
  $$delete from public.activity_interests where activity_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  'admin: da inattiva può restare senza tag'
);

----------------------------------------------------------------------------
-- RUOLO POSTGRES (import dei partner, dbAdmin): stessa regola
----------------------------------------------------------------------------
reset role;
select throws_ok(
  $$insert into public.activities (slug, place_id, title, duration_min, is_active) values ('test-import', 'aaaaaaaa-0000-0000-0000-000000000001', 'Import', 90, true)$$,
  'P0001', 'activity_without_tags', 'postgres: nemmeno l''import attiva attività senza tag'
);
select throws_ok(
  $$update public.activities set is_active = true where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  'P0001', 'activity_without_tags', 'postgres: non attiva un''attività senza tag'
);

----------------------------------------------------------------------------
-- STESSA TRANSAZIONE: attività attiva e tag insieme
----------------------------------------------------------------------------
set constraints all deferred;
insert into public.activities (id, slug, place_id, title, duration_min, is_active)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'test-insieme', 'aaaaaaaa-0000-0000-0000-000000000001', 'Insieme', 120, true);
insert into public.activity_interests (activity_id, interest_key, strength)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'sea', 2);
select lives_ok($$set constraints all immediate$$, 'stessa transazione: attività attiva e tag creati insieme superano il controllo');

set constraints all deferred;
insert into public.activities (slug, place_id, title, duration_min, is_active)
values ('test-dimenticata', 'aaaaaaaa-0000-0000-0000-000000000001', 'Tag dimenticati', 60, true);
select throws_ok(
  $$set constraints all immediate$$,
  'P0001', 'activity_without_tags', 'stessa transazione: senza tag il controllo scatta alla fine'
);

select * from finish();
rollback;
