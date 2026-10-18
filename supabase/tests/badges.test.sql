-- Passo 5.2: badge. Ogni criterio iniziale, assegnazione una volta sola, notifica una volta,
-- immutabilità di user_badges, privilegi delle funzioni, progresso solo per chi chiama.
-- Ruoli: alice (check-in in tutte le province e in Catania), bob (itinerario con attività a cibo e
-- vino), carol (proprietaria di un gruppo), dan (itinerario completato), erin e frank (entrano nel
-- gruppo con invito). Tutti i dati sono creati nel test e annullati dal rollback.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('carol');
select tests.create_user('dan');
select tests.create_user('erin');
select tests.create_user('frank');

-- Un check-in come lo scrive record_check_in (riga in check_ins e punti), senza la verifica di
-- distanza: il test sta sulla valutazione dei badge, non sulla posizione.
create or replace function tests.check_in_award(p_user uuid, p_place uuid, p_itinerary uuid default null)
returns void
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.check_ins (id, user_id, place_id, itinerary_id)
  values (v_id, p_user, p_place, p_itinerary);
  perform public.award_points(p_user, 10, 'check_in', 'check_in', v_id);
end;
$$;

----------------------------------------------------------------------------
-- FIXTURE
----------------------------------------------------------------------------

-- Luoghi: cinque in provincia di Catania (CT) e uno per ciascuna delle altre otto province.
insert into public.places (id, slug, name, province, lat, lng) values
  ('b5200000-0000-0000-0000-000000000001', 'test-s52-ct1', 'Luogo CT 1', 'CT', 37.5, 15.0),
  ('b5200000-0000-0000-0000-000000000002', 'test-s52-ct2', 'Luogo CT 2', 'CT', 37.5, 15.0),
  ('b5200000-0000-0000-0000-000000000003', 'test-s52-ct3', 'Luogo CT 3', 'CT', 37.5, 15.0),
  ('b5200000-0000-0000-0000-000000000004', 'test-s52-ct4', 'Luogo CT 4', 'CT', 37.5, 15.0),
  ('b5200000-0000-0000-0000-000000000005', 'test-s52-ct5', 'Luogo CT 5', 'CT', 37.5, 15.0),
  ('b5200000-0000-0000-0000-000000000006', 'test-s52-ag', 'Luogo AG', 'AG', 37.3, 13.6),
  ('b5200000-0000-0000-0000-000000000007', 'test-s52-cl', 'Luogo CL', 'CL', 37.5, 14.0),
  ('b5200000-0000-0000-0000-000000000008', 'test-s52-en', 'Luogo EN', 'EN', 37.5, 14.3),
  ('b5200000-0000-0000-0000-000000000009', 'test-s52-me', 'Luogo ME', 'ME', 38.2, 15.5),
  ('b5200000-0000-0000-0000-00000000000a', 'test-s52-pa', 'Luogo PA', 'PA', 38.1, 13.4),
  ('b5200000-0000-0000-0000-00000000000b', 'test-s52-rg', 'Luogo RG', 'RG', 36.9, 14.7),
  ('b5200000-0000-0000-0000-00000000000c', 'test-s52-sr', 'Luogo SR', 'SR', 37.1, 15.3),
  ('b5200000-0000-0000-0000-00000000000d', 'test-s52-tp', 'Luogo TP', 'TP', 38.0, 12.5);

-- Cinque attività attive a cibo e vino, una per luogo CT, con il loro itinerario di bob.
insert into public.activities (id, slug, place_id, title, duration_min, is_active) values
  ('b5210000-0000-0000-0000-0000000000a1', 'test-s52-a1', 'b5200000-0000-0000-0000-000000000001', 'Attività 1', 60, true),
  ('b5210000-0000-0000-0000-0000000000a2', 'test-s52-a2', 'b5200000-0000-0000-0000-000000000002', 'Attività 2', 60, true),
  ('b5210000-0000-0000-0000-0000000000a3', 'test-s52-a3', 'b5200000-0000-0000-0000-000000000003', 'Attività 3', 60, true),
  ('b5210000-0000-0000-0000-0000000000a4', 'test-s52-a4', 'b5200000-0000-0000-0000-000000000004', 'Attività 4', 60, true),
  ('b5210000-0000-0000-0000-0000000000a5', 'test-s52-a5', 'b5200000-0000-0000-0000-000000000005', 'Attività 5', 60, true);

insert into public.activity_interests (activity_id, interest_key, strength) values
  ('b5210000-0000-0000-0000-0000000000a1', 'food_wine', 2),
  ('b5210000-0000-0000-0000-0000000000a2', 'food_wine', 2),
  ('b5210000-0000-0000-0000-0000000000a3', 'food_wine', 2),
  ('b5210000-0000-0000-0000-0000000000a4', 'food_wine', 2),
  ('b5210000-0000-0000-0000-0000000000a5', 'food_wine', 2);

insert into public.itineraries (id, owner_id, title, days) values
  ('b5220000-0000-0000-0000-000000000001', tests.uid('bob'), 'Viaggio s52 bob', 1);

insert into public.itinerary_items (id, itinerary_id, day_index, position, activity_id) values
  ('b5230000-0000-0000-0000-0000000000a1', 'b5220000-0000-0000-0000-000000000001', 0, 0, 'b5210000-0000-0000-0000-0000000000a1'),
  ('b5230000-0000-0000-0000-0000000000a2', 'b5220000-0000-0000-0000-000000000001', 0, 1, 'b5210000-0000-0000-0000-0000000000a2'),
  ('b5230000-0000-0000-0000-0000000000a3', 'b5220000-0000-0000-0000-000000000001', 0, 2, 'b5210000-0000-0000-0000-0000000000a3'),
  ('b5230000-0000-0000-0000-0000000000a4', 'b5220000-0000-0000-0000-000000000001', 0, 3, 'b5210000-0000-0000-0000-0000000000a4'),
  ('b5230000-0000-0000-0000-0000000000a5', 'b5220000-0000-0000-0000-000000000001', 0, 4, 'b5210000-0000-0000-0000-0000000000a5');

----------------------------------------------------------------------------
-- PRIMO VIAGGIO (dan): assegnazione una volta sola, notifica una volta, immutabilità
----------------------------------------------------------------------------

select public.award_points(tests.uid('dan'), 100, 'itinerary_completed', 'itinerary', 'b5290000-0000-0000-0000-000000000001');
select public.award_points(tests.uid('dan'), 10, 'admin_adjust', 'admin', 'b5290000-0000-0000-0000-000000000002');

select is(
  (select count(*)::int from public.user_badges where user_id = tests.uid('dan') and badge_key = 'primo-viaggio'),
  1,
  'primo viaggio: assegnato una volta anche con due accrediti successivi'
);

select is(
  (select count(*)::int from public.notifications
   where user_id = tests.uid('dan') and kind = 'badge_earned' and payload->>'badgeKey' = 'primo-viaggio'),
  1,
  'primo viaggio: una sola notifica badge_earned'
);

select throws_ok(
  $$update public.user_badges set awarded_at = now() where user_id = tests.uid('dan')$$,
  'P0001', 'user_badges_immutable',
  'user_badges: nessun update'
);

select throws_ok(
  $$delete from public.user_badges where user_id = tests.uid('dan')$$,
  'P0001', 'user_badges_immutable',
  'user_badges: nessuna delete'
);

----------------------------------------------------------------------------
-- ESPLORATORE DELL'ETNA e NOVE SU NOVE (alice): cinque in CT, poi le altre province
----------------------------------------------------------------------------

select tests.check_in_award(tests.uid('alice'), 'b5200000-0000-0000-0000-000000000001');
select tests.check_in_award(tests.uid('alice'), 'b5200000-0000-0000-0000-000000000002');
select tests.check_in_award(tests.uid('alice'), 'b5200000-0000-0000-0000-000000000003');
select tests.check_in_award(tests.uid('alice'), 'b5200000-0000-0000-0000-000000000004');

select is(
  (select count(*)::int from public.user_badges where user_id = tests.uid('alice') and badge_key = 'esploratore-etna'),
  0,
  'esploratore: quattro check-in in CT non bastano'
);

select tests.check_in_award(tests.uid('alice'), 'b5200000-0000-0000-0000-000000000005');

select is(
  (select count(*)::int from public.user_badges where user_id = tests.uid('alice') and badge_key = 'esploratore-etna'),
  1,
  'esploratore: il quinto check-in in CT assegna il badge'
);

select tests.check_in_award(tests.uid('alice'), 'b5200000-0000-0000-0000-000000000006');
select tests.check_in_award(tests.uid('alice'), 'b5200000-0000-0000-0000-000000000007');
select tests.check_in_award(tests.uid('alice'), 'b5200000-0000-0000-0000-000000000008');
select tests.check_in_award(tests.uid('alice'), 'b5200000-0000-0000-0000-000000000009');

select is(
  (select count(*)::int from public.user_badges where user_id = tests.uid('alice') and badge_key = 'nove-su-nove'),
  0,
  'nove su nove: quattro province su nove non bastano'
);

select tests.check_in_award(tests.uid('alice'), 'b5200000-0000-0000-0000-00000000000a');
select tests.check_in_award(tests.uid('alice'), 'b5200000-0000-0000-0000-00000000000b');
select tests.check_in_award(tests.uid('alice'), 'b5200000-0000-0000-0000-00000000000c');
select tests.check_in_award(tests.uid('alice'), 'b5200000-0000-0000-0000-00000000000d');

select is(
  (select count(*)::int from public.user_badges where user_id = tests.uid('alice') and badge_key = 'nove-su-nove'),
  1,
  'nove su nove: un check-in in ciascuna delle nove province assegna il badge'
);

-- Un altro accredito rivaluta i badge: nessun duplicato, nessuna seconda notifica.
select public.award_points(tests.uid('alice'), 10, 'admin_adjust', 'admin', 'b5290000-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.notifications
   where user_id = tests.uid('alice') and kind = 'badge_earned' and payload->>'badgeKey' = 'esploratore-etna'),
  1,
  'esploratore: una sola notifica anche dopo una nuova valutazione'
);

----------------------------------------------------------------------------
-- BUONGUSTAIO (bob): cinque attività a cibo e vino completate nel suo itinerario
----------------------------------------------------------------------------

select tests.check_in_award(tests.uid('bob'), 'b5200000-0000-0000-0000-000000000001', 'b5220000-0000-0000-0000-000000000001');
select tests.check_in_award(tests.uid('bob'), 'b5200000-0000-0000-0000-000000000002', 'b5220000-0000-0000-0000-000000000001');
select tests.check_in_award(tests.uid('bob'), 'b5200000-0000-0000-0000-000000000003', 'b5220000-0000-0000-0000-000000000001');
select tests.check_in_award(tests.uid('bob'), 'b5200000-0000-0000-0000-000000000004', 'b5220000-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.user_badges where user_id = tests.uid('bob') and badge_key = 'buongustaio'),
  0,
  'buongustaio: quattro attività completate non bastano'
);

select tests.check_in_award(tests.uid('bob'), 'b5200000-0000-0000-0000-000000000005', 'b5220000-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.user_badges where user_id = tests.uid('bob') and badge_key = 'buongustaio'),
  1,
  'buongustaio: cinque attività a cibo e vino completate assegnano il badge'
);

----------------------------------------------------------------------------
-- ORGANIZZATORE (carol): gruppo con almeno quattro membri, valutato da accept_invite
----------------------------------------------------------------------------

select tests.authenticate_as('carol');
select set_config('tests.s52_group', public.create_group('Gruppo s52')::text, true);
reset role;

insert into public.group_invites (group_id, token_hash, invited_by)
values (
  current_setting('tests.s52_group')::uuid,
  encode(sha256(convert_to('tok-s52-1', 'UTF8')), 'hex'),
  tests.uid('carol')
);

select tests.authenticate_as('erin');
select public.accept_invite('tok-s52-1');
reset role;

select tests.authenticate_as('frank');
select public.accept_invite('tok-s52-1');
reset role;

select is(
  (select count(*)::int from public.user_badges where user_id = tests.uid('carol') and badge_key = 'organizzatore'),
  0,
  'organizzatore: tre membri (owner compreso) non bastano'
);

select tests.authenticate_as('dan');
select public.accept_invite('tok-s52-1');
reset role;

select is(
  (select count(*)::int from public.user_badges where user_id = tests.uid('carol') and badge_key = 'organizzatore'),
  1,
  'organizzatore: il quarto membro assegna il badge al proprietario del gruppo'
);

----------------------------------------------------------------------------
-- PROGRESSO: my_badge_progress restituisce solo i dati di chi chiama
----------------------------------------------------------------------------

select tests.authenticate_as('bob');
select is(
  (select current_value from public.my_badge_progress() where badge_key = 'nove-su-nove'),
  1,
  'progresso: bob ha check-in in una sola provincia (CT)'
);
select is(
  (select count(*)::int from public.my_badge_progress() where badge_key = 'buongustaio'),
  0,
  'progresso: il badge ottenuto da bob non compare nei prossimi'
);
reset role;

select tests.authenticate_as('alice');
select is(
  (select current_value from public.my_badge_progress() where badge_key = 'buongustaio'),
  0,
  'progresso: alice non ha attività a cibo e vino'
);
select is(
  (select count(*)::int from public.my_badge_progress() where badge_key = 'nove-su-nove'),
  0,
  'progresso: il badge ottenuto da alice non compare nei prossimi'
);
reset role;

----------------------------------------------------------------------------
-- PRIVILEGI
----------------------------------------------------------------------------

select is(
  has_function_privilege('authenticated', 'public.evaluate_badges(uuid)', 'EXECUTE'),
  false,
  'evaluate_badges: non eseguibile da authenticated'
);
select is(
  has_function_privilege('anon', 'public.evaluate_badges(uuid)', 'EXECUTE'),
  false,
  'evaluate_badges: non eseguibile da anon'
);
select is(
  has_function_privilege('authenticated', 'public.badge_progress(uuid)', 'EXECUTE'),
  false,
  'badge_progress: non eseguibile da authenticated'
);
select is(
  has_function_privilege('authenticated', 'public.my_badge_progress()', 'EXECUTE'),
  true,
  'my_badge_progress: eseguibile da authenticated'
);
select is(
  has_function_privilege('anon', 'public.my_badge_progress()', 'EXECUTE'),
  false,
  'my_badge_progress: non eseguibile da anon'
);

----------------------------------------------------------------------------
-- CRITERI: il check rifiuta un tipo sconosciuto
----------------------------------------------------------------------------

select throws_ok(
  $$insert into public.badges (key, name_it, name_en, criteria) values ('test-s52-bogus', 'Prova', 'Test', '{"type": "bogus", "min": 1}')$$,
  '23514',
  'new row for relation "badges" violates check constraint "badges_criteria_valid"',
  'criteri: un tipo sconosciuto è rifiutato'
);
select throws_ok(
  $$insert into public.badges (key, name_it, name_en, criteria) values ('test-s52-dieci', 'Prova', 'Test', '{"type": "provinces_checked_in", "min": 10}')$$,
  '23514', null, 'criteri: più di 9 province è rifiutato'
);
select throws_ok(
  $$insert into public.badges (key, name_it, name_en, criteria) values ('test-s52-uno', 'Prova', 'Test', '{"type": "group_size", "min": 1}')$$,
  '23514', null, 'criteri: un gruppo di una persona è rifiutato'
);

select * from finish();
rollback;
