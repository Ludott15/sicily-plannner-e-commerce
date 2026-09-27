-- Itinerari personali e template editoriali: itineraries, itinerary_items.
-- Ruoli: anonimo, proprietario (alice), altro utente (bob), admin.
-- Gli itinerari di gruppo (membro, ex membro) sono in groups_rls.test.sql.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('admin', true);

insert into public.places (id, slug, name, province, lat, lng)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'test-cefalu', 'Cefalù', 'PA', 38.03, 14.02);

-- Template editoriale con una voce, preparato come postgres.
insert into public.itineraries (id, owner_id, title, slug, is_template, days)
values ('cccccccc-0000-0000-0000-000000000001', null, 'Tre giorni a Palermo', 'test-tre-giorni', true, 3);
insert into public.itinerary_items (itinerary_id, day_index, position, place_id)
values ('cccccccc-0000-0000-0000-000000000001', 0, 0, 'aaaaaaaa-0000-0000-0000-000000000001');

----------------------------------------------------------------------------
-- PROPRIETARIO
----------------------------------------------------------------------------
select tests.authenticate_as('alice');

select lives_ok(
  format($$insert into public.itineraries (id, owner_id, title, days) values ('cccccccc-0000-0000-0000-000000000002', %L, 'Il mio viaggio', 5)$$, tests.uid('alice')),
  'proprietario: crea un itinerario proprio'
);
select lives_ok(
  $$insert into public.itinerary_items (itinerary_id, day_index, position, custom_title) values ('cccccccc-0000-0000-0000-000000000002', 0, 0, 'Arrivo')$$,
  'proprietario: aggiunge una voce'
);
select lives_ok(
  $$update public.itineraries set title = 'Viaggio aggiornato', status = 'planned' where id = 'cccccccc-0000-0000-0000-000000000002'$$,
  'proprietario: modifica titolo e stato'
);
select lives_ok(
  format($$insert into public.itineraries (owner_id, title, days, template_id) values (%L, 'Copia', 3, 'cccccccc-0000-0000-0000-000000000001')$$, tests.uid('alice')),
  'proprietario: copia da un template'
);
select results_eq(
  $$select title from public.itineraries
    where id::text like 'cccccccc-%' or template_id = 'cccccccc-0000-0000-0000-000000000001'
    order by title$$,
  $$values ('Copia'), ('Tre giorni a Palermo'), ('Viaggio aggiornato')$$,
  'proprietario: vede i propri itinerari e i template'
);
select throws_ok(
  format($$insert into public.itineraries (owner_id, title, days, slug) values (%L, 'SEO', 1, 'test-slug')$$, tests.uid('alice')),
  '42501', null, 'proprietario: non assegna uno slug'
);
select throws_ok(
  $$insert into public.itineraries (owner_id, title, days, is_template) values (null, 'Finto', 1, true)$$,
  '42501', null, 'proprietario: non crea template editoriali'
);
select throws_ok(
  format($$insert into public.itineraries (owner_id, title, days) values (%L, 'Per bob', 1)$$, tests.uid('bob')),
  '42501', null, 'proprietario: non crea itinerari a nome di altri'
);
select throws_ok(
  format($$update public.itineraries set owner_id = %L where id = 'cccccccc-0000-0000-0000-000000000002'$$, tests.uid('bob')),
  '42501', null, 'proprietario: non cambia owner_id'
);
select throws_ok(
  $$update public.itineraries set group_id = gen_random_uuid() where id = 'cccccccc-0000-0000-0000-000000000002'$$,
  '42501', null, 'proprietario: non collega un gruppo direttamente'
);
select throws_ok(
  $$insert into public.itinerary_items (itinerary_id, day_index, position, custom_title) values ('cccccccc-0000-0000-0000-000000000001', 1, 0, 'hack')$$,
  '42501', null, 'proprietario: non aggiunge voci a un template'
);
update public.itineraries set title = 'hack' where id = 'cccccccc-0000-0000-0000-000000000001';
reset role;
select is(
  (select title from public.itineraries where id = 'cccccccc-0000-0000-0000-000000000001'),
  'Tre giorni a Palermo',
  'proprietario: update di un template senza effetto'
);

----------------------------------------------------------------------------
-- ALTRO UTENTE
----------------------------------------------------------------------------
select tests.authenticate_as('bob');

select results_eq(
  $$select title from public.itineraries where id::text like 'cccccccc-%'$$,
  $$values ('Tre giorni a Palermo')$$,
  'altro utente: vede solo i template'
);
select is_empty(
  $$select 1 from public.itinerary_items where itinerary_id = 'cccccccc-0000-0000-0000-000000000002'$$,
  'altro utente: non vede le voci di alice'
);
select throws_ok(
  $$insert into public.itinerary_items (itinerary_id, day_index, position, custom_title) values ('cccccccc-0000-0000-0000-000000000002', 1, 0, 'hack')$$,
  '42501', null, 'altro utente: non aggiunge voci all''itinerario di alice'
);
update public.itineraries set title = 'hack' where id = 'cccccccc-0000-0000-0000-000000000002';
update public.itinerary_items set custom_title = 'hack' where itinerary_id = 'cccccccc-0000-0000-0000-000000000002';
delete from public.itinerary_items where itinerary_id = 'cccccccc-0000-0000-0000-000000000002';
delete from public.itineraries where id = 'cccccccc-0000-0000-0000-000000000002';
reset role;
select is(
  (select title from public.itineraries where id = 'cccccccc-0000-0000-0000-000000000002'),
  'Viaggio aggiornato',
  'altro utente: update e delete dell''itinerario di alice senza effetto'
);
select is(
  (select custom_title from public.itinerary_items where itinerary_id = 'cccccccc-0000-0000-0000-000000000002'),
  'Arrivo',
  'altro utente: update e delete delle voci di alice senza effetto'
);

----------------------------------------------------------------------------
-- ADMIN
----------------------------------------------------------------------------
select tests.authenticate_as('admin');

select is_empty(
  $$select 1 from public.itineraries where id = 'cccccccc-0000-0000-0000-000000000002'$$,
  'admin: non vede gli itinerari personali degli utenti'
);
select is_empty(
  $$select 1 from public.itinerary_items where itinerary_id = 'cccccccc-0000-0000-0000-000000000002'$$,
  'admin: non vede le voci degli itinerari personali'
);
select lives_ok(
  $$insert into public.itineraries (owner_id, title, days, is_template, slug) values (null, 'Barocco', 2, true, 'test-barocco')$$,
  'admin: crea un template editoriale con slug'
);
select lives_ok(
  $$insert into public.itinerary_items (itinerary_id, day_index, position, custom_title) values ('cccccccc-0000-0000-0000-000000000001', 1, 0, 'Monreale')$$,
  'admin: aggiunge voci a un template'
);
update public.itineraries set title = 'Tre giorni a Palermo e Monreale' where id = 'cccccccc-0000-0000-0000-000000000001';
reset role;
select is(
  (select title from public.itineraries where id = 'cccccccc-0000-0000-0000-000000000001'),
  'Tre giorni a Palermo e Monreale',
  'admin: modifica un template'
);

----------------------------------------------------------------------------
-- ANONIMO
----------------------------------------------------------------------------
select tests.as_anon();

select results_eq(
  $$select title from public.itineraries where id::text like 'cccccccc-%'$$,
  $$values ('Tre giorni a Palermo e Monreale')$$,
  'anon: vede solo i template'
);
select results_eq(
  $$select count(*)::int from public.itinerary_items where itinerary_id = 'cccccccc-0000-0000-0000-000000000001'$$,
  $$values (2)$$,
  'anon: vede le voci dei template'
);
select is_empty(
  $$select 1 from public.itinerary_items where itinerary_id = 'cccccccc-0000-0000-0000-000000000002'$$,
  'anon: non vede le voci degli itinerari personali'
);
select throws_ok(
  $$insert into public.itineraries (owner_id, title, days) values (null, 'x', 1)$$,
  '42501', null, 'anon: non crea itinerari'
);
select throws_ok(
  $$update public.itineraries set title = 'x'$$,
  '42501', null, 'anon: non modifica itinerari'
);

----------------------------------------------------------------------------
-- PROPRIETARIO: eliminazione
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('alice');
select lives_ok(
  $$delete from public.itineraries where id = 'cccccccc-0000-0000-0000-000000000002'$$,
  'proprietario: elimina il proprio itinerario'
);
reset role;
select is_empty(
  $$select 1 from public.itinerary_items where itinerary_id = 'cccccccc-0000-0000-0000-000000000002'$$,
  'proprietario: le voci si eliminano con l''itinerario'
);

select * from finish();
rollback;
