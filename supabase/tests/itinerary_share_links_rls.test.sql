-- Link pubblico in sola lettura (1.4): itinerary_share_links, shared_itinerary, note per giorno.
-- Ruoli: anonimo, proprietario (alice), altro utente (bob), ospite proprietario (carol), admin.
-- Nessuna dipendenza dal seed: tutti i dati sono creati dentro la transazione.
-- I token di prova sono in chiaro; nel database c'è solo il loro hash SHA-256 calcolato qui.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('admin', true);
select tests.create_guest('carol');

insert into public.places (id, slug, name, province, lat, lng)
values ('aaaaaaaa-0000-0000-0000-0000000000c1', 'test-share-luogo', 'Luogo condiviso', 'PA', 38.1, 13.3);
insert into public.places (id, slug, name, province, lat, lng, is_active)
values ('aaaaaaaa-0000-0000-0000-0000000000c2', 'test-share-luogo-spento', 'Luogo spento', 'PA', 38.2, 13.4, false);
-- Attività inattiva (nasce così): non deve comparire nel link pubblico.
insert into public.activities (id, slug, place_id, title, duration_min)
values ('bbbbbbbb-0000-0000-0000-0000000000c1', 'test-share-attivita-spenta', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'Attività spenta', 60);

-- Viaggio di alice, con titoli e note di giorno, preparato come postgres.
insert into public.itineraries (id, owner_id, title, days, start_date, travelers, day_titles, day_notes)
values (
  'cccccccc-0000-0000-0000-00000000c001', tests.uid('alice'), 'Viaggio condiviso', 2,
  '2027-05-01', 2, array['Primo giorno'], array['Nota del giorno uno']
);
insert into public.itinerary_items (itinerary_id, day_index, position, place_id, time_slot, notes)
values ('cccccccc-0000-0000-0000-00000000c001', 0, 0, 'aaaaaaaa-0000-0000-0000-0000000000c1', 'morning', 'Arrivo presto');
insert into public.itinerary_items (itinerary_id, day_index, position, custom_title, time_slot)
values ('cccccccc-0000-0000-0000-00000000c001', 0, 1, 'Pranzo libero', 'lunch');
insert into public.itinerary_items (itinerary_id, day_index, position, activity_id, time_slot)
values ('cccccccc-0000-0000-0000-00000000c001', 1, 0, 'bbbbbbbb-0000-0000-0000-0000000000c1', 'evening');
insert into public.itinerary_items (itinerary_id, day_index, position, place_id)
values ('cccccccc-0000-0000-0000-00000000c001', 1, 1, 'aaaaaaaa-0000-0000-0000-0000000000c2');

-- Link attivo di alice, creato come postgres (il token in chiaro è 'tok-alice-valido-0001').
insert into public.itinerary_share_links (id, itinerary_id, token_hash, created_by)
values (
  'dddddddd-0000-0000-0000-00000000c001', 'cccccccc-0000-0000-0000-00000000c001',
  encode(sha256(convert_to('tok-alice-valido-0001', 'UTF8')), 'hex'), tests.uid('alice')
);

-- Secondo viaggio con una sola tappa di attività attiva senza place_id proprio: nel link
-- pubblico il luogo è quello dell'attività. I vincoli differiti non scattano (rollback).
insert into public.activities (id, slug, place_id, title, duration_min, is_active)
values ('bbbbbbbb-0000-0000-0000-0000000000c2', 'test-share-attivita-attiva', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'Attività attiva', 60, true);
insert into public.itineraries (id, owner_id, title, days)
values ('cccccccc-0000-0000-0000-0000000000a1', tests.uid('alice'), 'Viaggio con attività', 1);
insert into public.itinerary_items (itinerary_id, day_index, position, activity_id)
values ('cccccccc-0000-0000-0000-0000000000a1', 0, 0, 'bbbbbbbb-0000-0000-0000-0000000000c2');
insert into public.itinerary_share_links (itinerary_id, token_hash, created_by)
values ('cccccccc-0000-0000-0000-0000000000a1', encode(sha256(convert_to('tok-luogo-attivita', 'UTF8')), 'hex'), tests.uid('alice'));

----------------------------------------------------------------------------
-- ANONIMO
----------------------------------------------------------------------------
select tests.as_anon();

select throws_ok(
  $$insert into public.itinerary_share_links (itinerary_id, token_hash, created_by) values ('cccccccc-0000-0000-0000-00000000c001', encode(sha256(convert_to('tok-anon', 'UTF8')), 'hex'), null)$$,
  '42501', null, 'anon: non crea link'
);
select is(
  public.shared_itinerary('tok-luogo-attivita') -> 'stops' -> 0 ->> 'place_name',
  'Luogo condiviso',
  'anon: per una tappa di attività il luogo è quello dell''attività'
);

select throws_ok(
  $$select 1 from public.itinerary_share_links$$,
  '42501', null, 'anon: non legge la tabella dei link'
);
select throws_ok(
  $$update public.itinerary_share_links set revoked_at = now()$$,
  '42501', null, 'anon: non revoca i link'
);
select throws_ok(
  $$update public.itineraries set day_notes = array['x'] where id = 'cccccccc-0000-0000-0000-00000000c001'$$,
  '42501', null, 'anon: non scrive le note di giorno'
);
select is(
  public.shared_itinerary('tok-alice-valido-0001') ->> 'title',
  'Viaggio condiviso',
  'anon: legge il viaggio con il token valido'
);
select is(
  public.shared_itinerary('token-sconosciuto'),
  null::jsonb,
  'anon: token sconosciuto restituisce null'
);
select is(
  public.shared_itinerary('tok-alice-valido-0001') ? 'owner_id',
  false,
  'anon: il jsonb non contiene owner_id'
);
select is(
  public.shared_itinerary('tok-alice-valido-0001') ? 'owner',
  false,
  'anon: il jsonb non contiene il proprietario'
);
select is(
  public.shared_itinerary('tok-alice-valido-0001') ->> 'start_date',
  '2027-05-01',
  'anon: il jsonb contiene la data di partenza'
);
select is(
  public.shared_itinerary('tok-alice-valido-0001') -> 'day_notes' ->> 0,
  'Nota del giorno uno',
  'anon: il jsonb contiene le note di giorno'
);
select is(
  public.shared_itinerary('tok-alice-valido-0001') -> 'day_titles' ->> 0,
  'Primo giorno',
  'anon: il jsonb contiene i titoli di giorno'
);
select is(
  jsonb_array_length(public.shared_itinerary('tok-alice-valido-0001') -> 'stops'),
  2,
  'anon: solo le tappe con attività e luogo attivi'
);
select is(
  public.shared_itinerary('tok-alice-valido-0001') -> 'stops' -> 0 ->> 'title',
  'Luogo condiviso',
  'anon: tappe con luogo, titolo dal luogo'
);
select is(
  public.shared_itinerary('tok-alice-valido-0001') -> 'stops' -> 0 ->> 'time_slot',
  'morning',
  'anon: tappa con fascia oraria'
);
select is(
  public.shared_itinerary('tok-alice-valido-0001') -> 'stops' -> 1 ->> 'title',
  'Pranzo libero',
  'anon: tappa libera, titolo dal campo custom'
);

----------------------------------------------------------------------------
-- ALTRO UTENTE (bob)
----------------------------------------------------------------------------
select tests.authenticate_as('bob');

select is_empty(
  $$select 1 from public.itinerary_share_links where itinerary_id = 'cccccccc-0000-0000-0000-00000000c001'$$,
  'altro utente: non vede i link del viaggio di alice'
);
select throws_ok(
  $$insert into public.itinerary_share_links (itinerary_id, token_hash, created_by) values ('cccccccc-0000-0000-0000-00000000c001', encode(sha256(convert_to('tok-bob-0001', 'UTF8')), 'hex'), tests.uid('bob'))$$,
  '42501', null, 'altro utente: non crea un link sul viaggio di alice'
);
update public.itinerary_share_links set revoked_at = now() where id = 'dddddddd-0000-0000-0000-00000000c001';
update public.itineraries set day_notes = array['Nota di bob'] where id = 'cccccccc-0000-0000-0000-00000000c001';
reset role;
select is(
  (select revoked_at from public.itinerary_share_links where id = 'dddddddd-0000-0000-0000-00000000c001') is null,
  true,
  'altro utente: la revoca del link di alice non ha effetto'
);
select is(
  (select day_notes[1] from public.itineraries where id = 'cccccccc-0000-0000-0000-00000000c001'),
  'Nota del giorno uno',
  'altro utente: non cambia le note di giorno di alice'
);

----------------------------------------------------------------------------
-- OSPITE PROPRIETARIO (carol)
----------------------------------------------------------------------------
select tests.authenticate_as('carol');

select lives_ok(
  format($$insert into public.itineraries (id, owner_id, title, days) values ('cccccccc-0000-0000-0000-00000000c002', %L, 'Viaggio ospite', 1)$$, tests.uid('carol')),
  'ospite proprietario: crea un itinerario proprio'
);
select lives_ok(
  format($$insert into public.itinerary_share_links (itinerary_id, token_hash, created_by) values ('cccccccc-0000-0000-0000-00000000c002', encode(sha256(convert_to('tok-carol-0001', 'UTF8')), 'hex'), %L)$$, tests.uid('carol')),
  'ospite proprietario: crea il link pubblico del proprio viaggio'
);
select lives_ok(
  $$update public.itineraries set day_notes = array['Nota ospite'] where id = 'cccccccc-0000-0000-0000-00000000c002'$$,
  'ospite proprietario: scrive la nota del giorno'
);

----------------------------------------------------------------------------
-- PROPRIETARIO (alice)
----------------------------------------------------------------------------
select tests.authenticate_as('alice');

select results_eq(
  $$select count(*)::int from public.itinerary_share_links where itinerary_id = 'cccccccc-0000-0000-0000-00000000c001'$$,
  $$values (1)$$,
  'proprietario: legge il suo link'
);
select throws_ok(
  $$insert into public.itinerary_share_links (itinerary_id, token_hash, created_by) values ('cccccccc-0000-0000-0000-00000000c001', encode(sha256(convert_to('tok-alice-doppio', 'UTF8')), 'hex'), tests.uid('alice'))$$,
  '23505', null, 'proprietario: un solo link attivo per viaggio'
);
select throws_ok(
  $$insert into public.itinerary_share_links (itinerary_id, token_hash, created_by) values ('cccccccc-0000-0000-0000-00000000c001', encode(sha256(convert_to('tok-alice-altrui', 'UTF8')), 'hex'), tests.uid('bob'))$$,
  '42501', null, 'proprietario: il link non si crea a nome di un altro utente'
);
select throws_ok(
  $$insert into public.itinerary_share_links (itinerary_id, token_hash, created_by) values ('cccccccc-0000-0000-0000-00000000c001', 'NON-ESADECIMALE', tests.uid('alice'))$$,
  '23514', null, 'proprietario: hash del token non valido'
);
select throws_ok(
  $$update public.itinerary_share_links set token_hash = encode(sha256(convert_to('tok-cambiato', 'UTF8')), 'hex') where id = 'dddddddd-0000-0000-0000-00000000c001'$$,
  '42501', null, 'proprietario: non cambia l''hash del token'
);
select lives_ok(
  $$update public.itineraries set day_notes = array['Nota del giorno uno aggiornata', 'Nota del giorno due'] where id = 'cccccccc-0000-0000-0000-00000000c001'$$,
  'proprietario: aggiorna le note di giorno'
);
select throws_ok(
  $$update public.itineraries set day_notes = array['a', 'b', 'c'] where id = 'cccccccc-0000-0000-0000-00000000c001'$$,
  '23514', null, 'proprietario: più note dei giorni'
);
select throws_ok(
  $$update public.itineraries set day_notes = array[repeat('x', 501)] where id = 'cccccccc-0000-0000-0000-00000000c001'$$,
  '23514', null, 'proprietario: nota di giorno oltre 500 caratteri'
);
select lives_ok(
  $$update public.itineraries set day_notes = array[repeat('x', 500)] where id = 'cccccccc-0000-0000-0000-00000000c001'$$,
  'proprietario: nota di giorno di 500 caratteri'
);
select lives_ok(
  $$update public.itinerary_share_links set revoked_at = now() where itinerary_id = 'cccccccc-0000-0000-0000-00000000c001' and revoked_at is null$$,
  'proprietario: revoca il link attivo'
);
select lives_ok(
  $$insert into public.itinerary_share_links (itinerary_id, token_hash, created_by) values ('cccccccc-0000-0000-0000-00000000c001', encode(sha256(convert_to('tok-alice-regenerato-0002', 'UTF8')), 'hex'), tests.uid('alice'))$$,
  'proprietario: rigenera il link dopo la revoca'
);
-- Un link revocato non si riattiva con un update: l'update non tocca nessuna riga.
update public.itinerary_share_links set revoked_at = null where id = 'dddddddd-0000-0000-0000-00000000c001';
reset role;
select is(
  (select revoked_at is not null from public.itinerary_share_links where id = 'dddddddd-0000-0000-0000-00000000c001'),
  true,
  'proprietario: un link revocato non si riattiva'
);
select is(
  (select count(*)::int from public.itinerary_share_links where itinerary_id = 'cccccccc-0000-0000-0000-00000000c001' and revoked_at is null),
  1,
  'proprietario: resta un solo link attivo'
);

----------------------------------------------------------------------------
-- ADMIN
----------------------------------------------------------------------------
select tests.authenticate_as('admin');

select is_empty(
  $$select 1 from public.itinerary_share_links where itinerary_id = 'cccccccc-0000-0000-0000-00000000c001'$$,
  'admin: non vede i link dei viaggi personali'
);
select throws_ok(
  $$insert into public.itinerary_share_links (itinerary_id, token_hash, created_by) values ('cccccccc-0000-0000-0000-00000000c001', encode(sha256(convert_to('tok-admin-0001', 'UTF8')), 'hex'), tests.uid('admin'))$$,
  '42501', null, 'admin: non crea link sui viaggi personali'
);

----------------------------------------------------------------------------
-- ANONIMO dopo la revoca
----------------------------------------------------------------------------
select tests.as_anon();

select is(
  public.shared_itinerary('tok-alice-valido-0001'),
  null::jsonb,
  'anon: il link revocato restituisce null'
);
select is(
  public.shared_itinerary('tok-alice-regenerato-0002') ->> 'title',
  'Viaggio condiviso',
  'anon: il link rigenerato funziona'
);
select is(
  public.shared_itinerary('tok-carol-0001') ->> 'title',
  'Viaggio ospite',
  'anon: il link di un ospite proprietario funziona'
);

select * from finish();
rollback;
