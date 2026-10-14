-- Notti di itinerario (1.3): itinerary_nights, più i check dei campi editoriali di itineraries
-- e di time_slot/notes di itinerary_items.
-- Ruoli: anonimo, proprietario (alice), altro utente (bob), ospite proprietario (carol), admin.
-- Nessuna dipendenza dal seed: tutti i dati sono creati dentro la transazione.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('admin', true);
select tests.create_guest('carol');

insert into public.areas (id, slug, name_it, name_en, sort)
values ('dddddddd-0000-0000-0000-000000000001', 'test-notti-area', 'Area notti', 'Nights area', 900);
insert into public.places (id, slug, name, province, lat, lng)
values ('aaaaaaaa-0000-0000-0000-0000000000b1', 'test-notti-luogo', 'Luogo notti', 'PA', 38.1, 13.3);

-- Template editoriale con la notte 1 (area), preparato come postgres.
insert into public.itineraries (id, owner_id, title, slug, is_template, days)
values ('cccccccc-0000-0000-0000-00000000b001', null, 'Notti di prova', 'test-notti-template', true, 3);
insert into public.itinerary_nights (itinerary_id, night_index, area_id)
values ('cccccccc-0000-0000-0000-00000000b001', 1, 'dddddddd-0000-0000-0000-000000000001');

----------------------------------------------------------------------------
-- PROPRIETARIO
----------------------------------------------------------------------------
select tests.authenticate_as('alice');

select lives_ok(
  format($$insert into public.itineraries (id, owner_id, title, days) values ('cccccccc-0000-0000-0000-00000000b002', %L, 'Notti private', 3)$$, tests.uid('alice')),
  'proprietario: crea un itinerario proprio'
);
select lives_ok(
  $$insert into public.itinerary_nights (itinerary_id, night_index, area_id) values ('cccccccc-0000-0000-0000-00000000b002', 1, 'dddddddd-0000-0000-0000-000000000001')$$,
  'proprietario: aggiunge la notte 1 con un''area'
);
select lives_ok(
  $$insert into public.itinerary_nights (itinerary_id, night_index, place_id) values ('cccccccc-0000-0000-0000-00000000b002', 2, 'aaaaaaaa-0000-0000-0000-0000000000b1')$$,
  'proprietario: aggiunge la notte 2 con un luogo'
);
select lives_ok(
  $$update public.itinerary_nights set area_id = null, place_id = 'aaaaaaaa-0000-0000-0000-0000000000b1' where itinerary_id = 'cccccccc-0000-0000-0000-00000000b002' and night_index = 1$$,
  'proprietario: cambia la notte 1 da area a luogo'
);
select results_eq(
  $$select night_index::int from public.itinerary_nights where itinerary_id = 'cccccccc-0000-0000-0000-00000000b002' order by night_index$$,
  $$values (1), (2)$$,
  'proprietario: legge le sue notti'
);
select throws_ok(
  $$insert into public.itinerary_nights (itinerary_id, night_index, area_id) values ('cccccccc-0000-0000-0000-00000000b002', 3, null)$$,
  '23514', null, 'proprietario: una notte senza area né luogo'
);
select throws_ok(
  $$insert into public.itinerary_nights (itinerary_id, night_index, area_id) values ('cccccccc-0000-0000-0000-00000000b002', 0, 'dddddddd-0000-0000-0000-000000000001')$$,
  '23514', null, 'proprietario: indice di notte sotto 1'
);
select throws_ok(
  $$insert into public.itinerary_nights (itinerary_id, night_index, area_id) values ('cccccccc-0000-0000-0000-00000000b002', 2, 'dddddddd-0000-0000-0000-000000000001')$$,
  '23505', null, 'proprietario: una sola riga per notte'
);
select throws_ok(
  format($$insert into public.itineraries (owner_id, title, days, day_intros) values (%L, 'Intro lunga', 2, array['a', 'b', 'c'])$$, tests.uid('alice')),
  '23514', null, 'proprietario: più intro dei giorni'
);
select throws_ok(
  format($$insert into public.itineraries (owner_id, title, days, day_intros) values (%L, 'Intro lunga', 1, array[repeat('x', 281)])$$, tests.uid('alice')),
  '23514', null, 'proprietario: intro del giorno oltre 280 caratteri'
);
select lives_ok(
  format($$insert into public.itineraries (owner_id, title, days, day_intros) values (%L, 'Intro al limite', 1, array[repeat('x', 280)])$$, tests.uid('alice')),
  'proprietario: intro del giorno di 280 caratteri'
);
select throws_ok(
  format($$insert into public.itineraries (owner_id, title, days, subtitle) values (%L, 'Sottotitolo lungo', 1, %L)$$, tests.uid('alice'), repeat('x', 141)),
  '23514', null, 'proprietario: sottotitolo oltre 140 caratteri'
);
select throws_ok(
  format($$insert into public.itineraries (owner_id, title, days, description) values (%L, 'Descrizione lunga', 1, %L)$$, tests.uid('alice'), repeat('x', 2001)),
  '23514', null, 'proprietario: descrizione oltre 2000 caratteri'
);
select throws_ok(
  format($$insert into public.itineraries (owner_id, title, days, season_months) values (%L, 'Mese errato', 1, array[13]::smallint[])$$, tests.uid('alice')),
  '23514', null, 'proprietario: mese stagionale fuori da 1..12'
);
select throws_ok(
  $$update public.itineraries set day_intros = array['a', 'b', 'c', 'd'] where id = 'cccccccc-0000-0000-0000-00000000b002'$$,
  '23514', null, 'proprietario: aggiornamento con più intro dei giorni'
);
select lives_ok(
  $$insert into public.itinerary_items (itinerary_id, day_index, position, custom_title, time_slot, notes) values ('cccccccc-0000-0000-0000-00000000b002', 0, 1, 'Pranzo', 'lunch', 'Prenotare il tavolo')$$,
  'proprietario: voce con fascia oraria e nota'
);
select lives_ok(
  $$update public.itinerary_items set time_slot = 'evening' where itinerary_id = 'cccccccc-0000-0000-0000-00000000b002' and custom_title = 'Pranzo'$$,
  'proprietario: cambia la fascia oraria di una voce'
);
select throws_ok(
  $$insert into public.itinerary_items (itinerary_id, day_index, position, custom_title, time_slot) values ('cccccccc-0000-0000-0000-00000000b002', 0, 2, 'Cena', 'night')$$,
  '22P02', null, 'proprietario: fascia oraria sconosciuta'
);
select throws_ok(
  $$insert into public.itinerary_items (itinerary_id, day_index, position, custom_title, notes) values ('cccccccc-0000-0000-0000-00000000b002', 0, 3, 'Nota lunga', repeat('x', 281))$$,
  '23514', null, 'proprietario: nota della voce oltre 280 caratteri'
);

----------------------------------------------------------------------------
-- ALTRO UTENTE
----------------------------------------------------------------------------
select tests.authenticate_as('bob');

select is_empty(
  $$select 1 from public.itinerary_nights where itinerary_id = 'cccccccc-0000-0000-0000-00000000b002'$$,
  'altro utente: non vede le notti di alice'
);
select throws_ok(
  $$insert into public.itinerary_nights (itinerary_id, night_index, area_id) values ('cccccccc-0000-0000-0000-00000000b002', 3, 'dddddddd-0000-0000-0000-000000000001')$$,
  '42501', null, 'altro utente: non aggiunge notti all''itinerario di alice'
);
update public.itinerary_nights set area_id = 'dddddddd-0000-0000-0000-000000000001' where itinerary_id = 'cccccccc-0000-0000-0000-00000000b002' and night_index = 2;
delete from public.itinerary_nights where itinerary_id = 'cccccccc-0000-0000-0000-00000000b002';
reset role;
select is(
  (select count(*)::int from public.itinerary_nights where itinerary_id = 'cccccccc-0000-0000-0000-00000000b002'),
  2,
  'altro utente: update e delete delle notti di alice senza effetto'
);
select is(
  (select count(*)::int from public.itinerary_nights where itinerary_id = 'cccccccc-0000-0000-0000-00000000b002' and area_id is not null),
  0,
  'altro utente: l''update non ha cambiato l''area della notte 2'
);

----------------------------------------------------------------------------
-- OSPITE PROPRIETARIO
----------------------------------------------------------------------------
select tests.authenticate_as('carol');

select lives_ok(
  format($$insert into public.itineraries (id, owner_id, title, days) values ('cccccccc-0000-0000-0000-00000000b003', %L, 'Viaggio ospite', 2)$$, tests.uid('carol')),
  'ospite proprietario: crea un itinerario proprio'
);
select lives_ok(
  $$insert into public.itinerary_nights (itinerary_id, night_index, area_id) values ('cccccccc-0000-0000-0000-00000000b003', 1, 'dddddddd-0000-0000-0000-000000000001')$$,
  'ospite proprietario: aggiunge una notte'
);
select lives_ok(
  $$update public.itinerary_nights set area_id = null, place_id = 'aaaaaaaa-0000-0000-0000-0000000000b1' where itinerary_id = 'cccccccc-0000-0000-0000-00000000b003' and night_index = 1$$,
  'ospite proprietario: cambia la notte'
);
select lives_ok(
  $$delete from public.itinerary_nights where itinerary_id = 'cccccccc-0000-0000-0000-00000000b003' and night_index = 1$$,
  'ospite proprietario: elimina la notte'
);

----------------------------------------------------------------------------
-- ADMIN
----------------------------------------------------------------------------
select tests.authenticate_as('admin');

select is_empty(
  $$select 1 from public.itinerary_nights where itinerary_id = 'cccccccc-0000-0000-0000-00000000b002'$$,
  'admin: non vede le notti degli itinerari personali'
);
select throws_ok(
  $$insert into public.itinerary_nights (itinerary_id, night_index, area_id) values ('cccccccc-0000-0000-0000-00000000b002', 3, 'dddddddd-0000-0000-0000-000000000001')$$,
  '42501', null, 'admin: non scrive le notti di un itinerario personale'
);
select lives_ok(
  $$insert into public.itinerary_nights (itinerary_id, night_index, place_id) values ('cccccccc-0000-0000-0000-00000000b001', 2, 'aaaaaaaa-0000-0000-0000-0000000000b1')$$,
  'admin: aggiunge una notte a un template'
);
select lives_ok(
  $$update public.itinerary_nights set area_id = 'dddddddd-0000-0000-0000-000000000001', place_id = null where itinerary_id = 'cccccccc-0000-0000-0000-00000000b001' and night_index = 2$$,
  'admin: cambia una notte di un template'
);

----------------------------------------------------------------------------
-- ANONIMO
----------------------------------------------------------------------------
select tests.as_anon();

select results_eq(
  $$select count(*)::int from public.itinerary_nights where itinerary_id = 'cccccccc-0000-0000-0000-00000000b001'$$,
  $$values (2)$$,
  'anon: vede le notti dei template'
);
select is_empty(
  $$select 1 from public.itinerary_nights where itinerary_id = 'cccccccc-0000-0000-0000-00000000b002'$$,
  'anon: non vede le notti degli itinerari personali'
);
select is_empty(
  $$select 1 from public.itinerary_nights where itinerary_id = 'cccccccc-0000-0000-0000-00000000b003'$$,
  'anon: non vede le notti dell''ospite'
);
select throws_ok(
  $$insert into public.itinerary_nights (itinerary_id, night_index, area_id) values ('cccccccc-0000-0000-0000-00000000b001', 3, 'dddddddd-0000-0000-0000-000000000001')$$,
  '42501', null, 'anon: non aggiunge notti a un template'
);
select throws_ok(
  $$update public.itinerary_nights set area_id = 'dddddddd-0000-0000-0000-000000000001'$$,
  '42501', null, 'anon: non modifica le notti'
);
select throws_ok(
  $$delete from public.itinerary_nights$$,
  '42501', null, 'anon: non elimina le notti'
);

----------------------------------------------------------------------------
-- PROPRIETARIO: eliminazione di una notte
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('alice');
select lives_ok(
  $$delete from public.itinerary_nights where itinerary_id = 'cccccccc-0000-0000-0000-00000000b002' and night_index = 2$$,
  'proprietario: elimina una notte'
);
reset role;
select is(
  (select count(*)::int from public.itinerary_nights where itinerary_id = 'cccccccc-0000-0000-0000-00000000b002'),
  1,
  'proprietario: resta la notte non eliminata'
);

----------------------------------------------------------------------------
-- CANCELLAZIONE DI UN'AREA (come postgres): la notte che la indicava sparisce
----------------------------------------------------------------------------
insert into public.areas (id, slug, name_it, name_en, sort)
values ('dddddddd-0000-0000-0000-000000000002', 'test-notti-area-cancellata', 'Area da cancellare', 'Area to delete', 901);
insert into public.itinerary_nights (itinerary_id, night_index, area_id)
values ('cccccccc-0000-0000-0000-00000000b002', 3, 'dddddddd-0000-0000-0000-000000000002');

select lives_ok(
  $$delete from public.areas where id = 'dddddddd-0000-0000-0000-000000000002'$$,
  'cancellazione dell''area: riesce anche se una notte la usa'
);
select is(
  (select count(*)::int from public.itinerary_nights where itinerary_id = 'cccccccc-0000-0000-0000-00000000b002' and night_index = 3),
  0,
  'cancellazione dell''area: la notte che la indicava sparisce'
);

select * from finish();
rollback;
