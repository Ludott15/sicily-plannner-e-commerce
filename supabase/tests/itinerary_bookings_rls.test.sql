-- Checklist "Da prenotare" (M5): itinerary_bookings, più travelers e day_titles su itineraries.
-- Ruoli: anonimo, proprietario (alice), altro utente (bob), ospite proprietario (guest),
-- membro ed ex membro del gruppo di un itinerario condiviso, admin.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_guest('guest');
select tests.create_user('member');
select tests.create_user('ex');
select tests.create_user('admin', true);

insert into public.places (id, slug, name, province, lat, lng)
values ('aaaaaaaa-0000-0000-0000-0000000000b1', 'test-luogo-pren', 'Luogo', 'PA', 38.1, 13.3);
insert into public.activities (id, slug, place_id, title, duration_min)
values ('bbbbbbbb-0000-0000-0000-0000000000b1', 'test-attivita-pren', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'Attività', 60);

-- Itinerari preparati come postgres: di alice, dell'ospite, di gruppo (owner alice), un template.
insert into public.itineraries (id, owner_id, title, days) values
  ('cccccccc-0000-0000-0000-0000000000b1', tests.uid('alice'), 'Di alice', 3),
  ('cccccccc-0000-0000-0000-0000000000b2', tests.uid('guest'), 'Dell''ospite', 2),
  ('cccccccc-0000-0000-0000-0000000000b3', tests.uid('alice'), 'Di gruppo', 2);
insert into public.itineraries (id, owner_id, title, slug, is_template, days)
values ('cccccccc-0000-0000-0000-0000000000b4', null, 'Pronto', 'test-pronto-pren', true, 2);
insert into public.groups (id, name, owner_id, itinerary_id)
values ('dddddddd-0000-0000-0000-0000000000b1', 'Gruppo', tests.uid('alice'), 'cccccccc-0000-0000-0000-0000000000b3');
update public.itineraries set group_id = 'dddddddd-0000-0000-0000-0000000000b1' where id = 'cccccccc-0000-0000-0000-0000000000b3';
insert into public.group_members (group_id, user_id, role) values
  ('dddddddd-0000-0000-0000-0000000000b1', tests.uid('member'), 'member'),
  ('dddddddd-0000-0000-0000-0000000000b1', tests.uid('ex'), 'member');
insert into public.itinerary_bookings (id, itinerary_id, kind) values
  ('eeeeeeee-0000-0000-0000-0000000000b1', 'cccccccc-0000-0000-0000-0000000000b1', 'lodging'),
  ('eeeeeeee-0000-0000-0000-0000000000b3', 'cccccccc-0000-0000-0000-0000000000b3', 'car');
-- Una voce su un itinerario pronto (solo come postgres: dal client non si può crearla). Serve a
-- provare update e delete da chi la vede (itinerario pubblico) ma non può modificarla.
insert into public.itinerary_bookings (id, itinerary_id, kind) values
  ('eeeeeeee-0000-0000-0000-0000000000b4', 'cccccccc-0000-0000-0000-0000000000b4', 'lodging');
-- L'ex membro esce dal gruppo.
delete from public.group_members where user_id = tests.uid('ex');

----------------------------------------------------------------------------
-- ANONIMO
----------------------------------------------------------------------------
select tests.as_anon();
select throws_ok($$select * from public.itinerary_bookings$$, '42501', null, 'anon: non legge le prenotazioni');
select throws_ok(
  $$insert into public.itinerary_bookings (itinerary_id, kind) values ('cccccccc-0000-0000-0000-0000000000b1', 'car')$$,
  '42501', null, 'anon: non inserisce'
);

----------------------------------------------------------------------------
-- PROPRIETARIO
----------------------------------------------------------------------------
select tests.authenticate_as('alice');
select results_eq(
  $$select id::text from public.itinerary_bookings where itinerary_id <> 'cccccccc-0000-0000-0000-0000000000b4' order by id$$,
  $$values ('eeeeeeee-0000-0000-0000-0000000000b1'), ('eeeeeeee-0000-0000-0000-0000000000b3')$$,
  'proprietario: vede le prenotazioni dei propri itinerari, anche di gruppo'
);
select lives_ok(
  $$insert into public.itinerary_bookings (itinerary_id, kind, activity_id) values ('cccccccc-0000-0000-0000-0000000000b1', 'activity', 'bbbbbbbb-0000-0000-0000-0000000000b1')$$,
  'proprietario: aggiunge una voce'
);
select lives_ok(
  $$update public.itinerary_bookings set status = 'booked' where id = 'eeeeeeee-0000-0000-0000-0000000000b1'$$,
  'proprietario: segna come prenotato'
);
select results_eq(
  $$select status::text, updated_by = auth.uid() from public.itinerary_bookings where id = 'eeeeeeee-0000-0000-0000-0000000000b1'$$,
  $$values ('booked', true)$$,
  'proprietario: lo stato cambia e updated_by è chi l''ha segnato'
);
select throws_ok(
  $$update public.itinerary_bookings set updated_by = null where id = 'eeeeeeee-0000-0000-0000-0000000000b1'$$,
  '42501', null, 'proprietario: updated_by non si scrive dal client'
);
select throws_ok(
  $$update public.itinerary_bookings set itinerary_id = 'cccccccc-0000-0000-0000-0000000000b2' where id = 'eeeeeeee-0000-0000-0000-0000000000b1'$$,
  '42501', null, 'proprietario: non sposta una voce su un altro itinerario'
);
select throws_ok(
  $$insert into public.itinerary_bookings (itinerary_id, kind) values ('cccccccc-0000-0000-0000-0000000000b1', 'lodging')$$,
  '23505', null, 'una sola voce per tipo e attività nello stesso itinerario'
);
select throws_ok(
  $$insert into public.itinerary_bookings (itinerary_id, kind) values ('cccccccc-0000-0000-0000-0000000000b1', 'activity')$$,
  '23514', null, 'una voce di tipo attività ha l''attività'
);
select throws_ok(
  $$insert into public.itinerary_bookings (itinerary_id, kind) values ('cccccccc-0000-0000-0000-0000000000b2', 'car')$$,
  '42501', null, 'proprietario: non inserisce nell''itinerario di un altro'
);
select lives_ok(
  $$update public.itineraries set travelers = 4, day_titles = '{"Arrivo","Mare"}' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$,
  'proprietario: cambia persone e titoli dei giorni'
);
select throws_ok(
  $$update public.itineraries set travelers = 0 where id = 'cccccccc-0000-0000-0000-0000000000b1'$$,
  '23514', null, 'persone tra 1 e 30'
);

----------------------------------------------------------------------------
-- ALTRO UTENTE
----------------------------------------------------------------------------
select tests.authenticate_as('bob');
select is_empty($$select 1 from public.itinerary_bookings where itinerary_id <> 'cccccccc-0000-0000-0000-0000000000b4'$$, 'altro utente: non vede le prenotazioni degli altri');
select throws_ok(
  $$insert into public.itinerary_bookings (itinerary_id, kind) values ('cccccccc-0000-0000-0000-0000000000b1', 'car')$$,
  '42501', null, 'altro utente: non inserisce'
);
update public.itinerary_bookings set status = 'to_book' where id = 'eeeeeeee-0000-0000-0000-0000000000b1';
delete from public.itinerary_bookings where id = 'eeeeeeee-0000-0000-0000-0000000000b1';
update public.itineraries set travelers = 9, day_titles = '{"hack"}' where id = 'cccccccc-0000-0000-0000-0000000000b1';
-- Vede l'itinerario pronto e la sua voce, ma non li modifica.
select isnt_empty(
  $$select 1 from public.itinerary_bookings where id = 'eeeeeeee-0000-0000-0000-0000000000b4'$$,
  'altro utente: vede la voce dell''itinerario pronto (pubblico)'
);
update public.itinerary_bookings set status = 'booked' where id = 'eeeeeeee-0000-0000-0000-0000000000b4';
delete from public.itinerary_bookings where id = 'eeeeeeee-0000-0000-0000-0000000000b4';
update public.itineraries set travelers = 9, day_titles = '{"hack"}' where id = 'cccccccc-0000-0000-0000-0000000000b4';

----------------------------------------------------------------------------
-- OSPITE (sui propri itinerari sì)
----------------------------------------------------------------------------
select tests.authenticate_as('guest');
select lives_ok(
  $$insert into public.itinerary_bookings (itinerary_id, kind) values ('cccccccc-0000-0000-0000-0000000000b2', 'car')$$,
  'ospite: aggiunge una voce al proprio itinerario'
);
select lives_ok(
  $$update public.itinerary_bookings set status = 'booked' where itinerary_id = 'cccccccc-0000-0000-0000-0000000000b2'$$,
  'ospite: segna come prenotato'
);
select results_eq(
  $$select itinerary_id::text, status::text from public.itinerary_bookings where itinerary_id <> 'cccccccc-0000-0000-0000-0000000000b4'$$,
  $$values ('cccccccc-0000-0000-0000-0000000000b2', 'booked')$$,
  'ospite: vede solo le proprie'
);
select throws_ok(
  $$insert into public.itinerary_bookings (itinerary_id, kind) values ('cccccccc-0000-0000-0000-0000000000b1', 'flight')$$,
  '42501', null, 'ospite: non inserisce negli itinerari degli altri'
);

----------------------------------------------------------------------------
-- MEMBRO ED EX MEMBRO DEL GRUPPO
----------------------------------------------------------------------------
select tests.authenticate_as('member');
select results_eq(
  $$select id::text from public.itinerary_bookings where itinerary_id <> 'cccccccc-0000-0000-0000-0000000000b4'$$,
  $$values ('eeeeeeee-0000-0000-0000-0000000000b3')$$,
  'membro: vede la checklist dell''itinerario di gruppo, non quelle personali'
);
select lives_ok(
  $$update public.itinerary_bookings set status = 'booked' where id = 'eeeeeeee-0000-0000-0000-0000000000b3'$$,
  'membro: segna lo stato sull''itinerario di gruppo'
);

select tests.authenticate_as('ex');
select is_empty($$select 1 from public.itinerary_bookings where itinerary_id <> 'cccccccc-0000-0000-0000-0000000000b4'$$, 'ex membro: non vede più la checklist');
update public.itinerary_bookings set status = 'to_book' where id = 'eeeeeeee-0000-0000-0000-0000000000b3';
select throws_ok(
  $$insert into public.itinerary_bookings (itinerary_id, kind) values ('cccccccc-0000-0000-0000-0000000000b3', 'flight')$$,
  '42501', null, 'ex membro: non inserisce'
);

----------------------------------------------------------------------------
-- ADMIN: niente checklist sugli itinerari pronti
----------------------------------------------------------------------------
select tests.authenticate_as('admin');
select throws_ok(
  $$insert into public.itinerary_bookings (itinerary_id, kind) values ('cccccccc-0000-0000-0000-0000000000b4', 'lodging')$$,
  '42501', null, 'admin: nessuna prenotazione su un itinerario pronto'
);

-- Verifiche finali come postgres: gli update e i delete non autorizzati non hanno avuto effetto.
reset role;
select results_eq(
  $$select id::text, status::text from public.itinerary_bookings where id in ('eeeeeeee-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-0000000000b3') order by id$$,
  $$values ('eeeeeeee-0000-0000-0000-0000000000b1', 'booked'), ('eeeeeeee-0000-0000-0000-0000000000b3', 'booked')$$,
  'altro utente ed ex membro: update e delete senza effetto'
);
select results_eq(
  $$select travelers, day_titles from public.itineraries where id = 'cccccccc-0000-0000-0000-0000000000b1'$$,
  $$values (4::smallint, '{"Arrivo","Mare"}'::text[])$$,
  'altro utente: persone e titoli dei giorni non cambiano'
);
select results_eq(
  $$select status::text from public.itinerary_bookings where id = 'eeeeeeee-0000-0000-0000-0000000000b4'$$,
  $$values ('to_book')$$,
  'altro utente: non cambia né cancella la voce che vede ma non può modificare'
);
select results_eq(
  $$select travelers, day_titles from public.itineraries where id = 'cccccccc-0000-0000-0000-0000000000b4'$$,
  $$values (null::smallint, '{}'::text[])$$,
  'altro utente: non cambia persone e titoli di un itinerario pronto'
);
select results_eq(
  $$select updated_by = tests.uid('member') from public.itinerary_bookings where id = 'eeeeeeee-0000-0000-0000-0000000000b3'$$,
  $$values (true)$$,
  'updated_by: l''ultimo che ha segnato (il membro)'
);

select * from finish();
rollback;
