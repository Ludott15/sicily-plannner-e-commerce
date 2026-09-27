-- Catalogo: interests, places, activities, activity_interests.
-- Nessun proprietario per riga: si coprono anonimo, utente autenticato (anche "altro utente") e admin.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('user');
select tests.create_user('admin', true);

insert into public.places (id, slug, name, province, lat, lng)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'test-bronte', 'Bronte', 'CT', 37.79, 14.83);

insert into public.activities (id, slug, place_id, title, duration_min, is_active)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'test-attiva', 'aaaaaaaa-0000-0000-0000-000000000001', 'Attiva', 120, true),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'test-inattiva', 'aaaaaaaa-0000-0000-0000-000000000001', 'Inattiva', 60, false);

insert into public.activity_interests (activity_id, interest_key, strength)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'food_wine', 3),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'nature_hiking', 2);

----------------------------------------------------------------------------
-- ANONIMO
----------------------------------------------------------------------------
select tests.as_anon();

select isnt_empty($$select 1 from public.interests where key = 'sea'$$, 'anon: legge gli interessi');
select isnt_empty($$select 1 from public.places where slug = 'test-bronte'$$, 'anon: legge i luoghi');
select results_eq(
  $$select slug from public.activities where slug like 'test-%' order by slug$$,
  $$values ('test-attiva')$$,
  'anon: vede solo le attività attive'
);
select results_eq(
  $$select interest_key from public.activity_interests where activity_id::text like 'bbbbbbbb-%'$$,
  $$values ('food_wine')$$,
  'anon: vede solo i tag delle attività attive'
);
select throws_ok($$insert into public.interests (key, label_it, label_en) values ('x', 'x', 'x')$$, '42501', null, 'anon: non inserisce interessi');
select throws_ok($$insert into public.places (slug, name, province, lat, lng) values ('x', 'x', 'PA', 38, 13)$$, '42501', null, 'anon: non inserisce luoghi');
select throws_ok($$update public.activities set title = 'x'$$, '42501', null, 'anon: non modifica attività');
select throws_ok($$delete from public.activity_interests$$, '42501', null, 'anon: non cancella tag');

----------------------------------------------------------------------------
-- UTENTE AUTENTICATO (non admin)
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('user');

select results_eq(
  $$select slug from public.activities where slug like 'test-%' order by slug$$,
  $$values ('test-attiva')$$,
  'utente: vede solo le attività attive'
);
select results_eq(
  $$select interest_key from public.activity_interests where activity_id::text like 'bbbbbbbb-%'$$,
  $$values ('food_wine')$$,
  'utente: vede solo i tag delle attività attive'
);
select throws_ok($$insert into public.interests (key, label_it, label_en) values ('x', 'x', 'x')$$, '42501', null, 'utente: non inserisce interessi');
select throws_ok($$insert into public.places (slug, name, province, lat, lng) values ('x', 'x', 'PA', 38, 13)$$, '42501', null, 'utente: non inserisce luoghi');
select throws_ok(
  $$insert into public.activities (slug, place_id, title, duration_min) values ('x', 'aaaaaaaa-0000-0000-0000-000000000001', 'x', 10)$$,
  '42501', null, 'utente: non inserisce attività'
);
select throws_ok(
  $$insert into public.activity_interests (activity_id, interest_key, strength) values ('bbbbbbbb-0000-0000-0000-000000000001', 'sea', 1)$$,
  '42501', null, 'utente: non inserisce tag'
);

update public.interests set label_it = 'hack' where key = 'sea';
update public.places set name = 'hack' where slug = 'test-bronte';
update public.activities set title = 'hack' where slug = 'test-attiva';
update public.activity_interests set strength = 1 where activity_id = 'bbbbbbbb-0000-0000-0000-000000000001';
delete from public.interests where key = 'relax';
delete from public.places where slug = 'test-bronte';
delete from public.activities where slug = 'test-attiva';
delete from public.activity_interests where activity_id = 'bbbbbbbb-0000-0000-0000-000000000001';

reset role;
select is((select label_it from public.interests where key = 'sea'), 'Mare', 'utente: update di interests senza effetto');
select is((select name from public.places where slug = 'test-bronte'), 'Bronte', 'utente: update di places senza effetto');
select is((select title from public.activities where slug = 'test-attiva'), 'Attiva', 'utente: update di activities senza effetto');
select is(
  (select strength from public.activity_interests where activity_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  3::smallint,
  'utente: update di activity_interests senza effetto'
);
select isnt_empty($$select 1 from public.interests where key = 'relax'$$, 'utente: delete di interests senza effetto');
select isnt_empty($$select 1 from public.places where slug = 'test-bronte'$$, 'utente: delete di places senza effetto');
select isnt_empty($$select 1 from public.activities where slug = 'test-attiva'$$, 'utente: delete di activities senza effetto');
select isnt_empty(
  $$select 1 from public.activity_interests where activity_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  'utente: delete di activity_interests senza effetto'
);

----------------------------------------------------------------------------
-- ADMIN
----------------------------------------------------------------------------
select tests.authenticate_as('admin');

select results_eq(
  $$select slug from public.activities where slug like 'test-%' order by slug$$,
  $$values ('test-attiva'), ('test-inattiva')$$,
  'admin: vede anche le attività inattive'
);
select results_eq(
  $$select interest_key from public.activity_interests where activity_id::text like 'bbbbbbbb-%' order by interest_key$$,
  $$values ('food_wine'), ('nature_hiking')$$,
  'admin: vede i tag di tutte le attività'
);
select lives_ok($$insert into public.interests (key, label_it, label_en) values ('test_new', 'Nuovo', 'New')$$, 'admin: inserisce interessi');
select lives_ok($$insert into public.places (slug, name, province, lat, lng) values ('test-noto', 'Noto', 'SR', 36.89, 15.07)$$, 'admin: inserisce luoghi');
select lives_ok(
  $$insert into public.activities (slug, place_id, title, duration_min) values ('test-nuova', 'aaaaaaaa-0000-0000-0000-000000000001', 'Nuova', 90)$$,
  'admin: inserisce attività'
);
select lives_ok(
  $$insert into public.activity_interests (activity_id, interest_key, strength) values ('bbbbbbbb-0000-0000-0000-000000000002', 'sea', 1)$$,
  'admin: inserisce tag'
);
update public.activities set is_active = true where slug = 'test-inattiva';
delete from public.interests where key = 'test_new';

reset role;
select is((select is_active from public.activities where slug = 'test-inattiva'), true, 'admin: attiva un''attività');
select is_empty($$select 1 from public.interests where key = 'test_new'$$, 'admin: cancella interessi');

select * from finish();
rollback;
