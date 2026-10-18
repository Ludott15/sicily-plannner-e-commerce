-- Passo 5.1: punti, check-in e recensioni.
-- Ruoli: alice (proprietaria dell'itinerario), bob (membro del gruppo), carol (altro utente),
-- dan (entrato con invito e con un click di affiliazione), erin e frank (invitati), guest
-- (ospite), admin, anonimo.
-- Distanze: p1-p2 circa 55 m, p1-p4 circa 88 m, p1-p3 circa 1,1 km, p1-p7 circa 4,4 km.
begin;
\ir helpers/setup.psql
select * from no_plan();

create or replace function tests.gid() returns uuid
language sql
stable
as $$ select current_setting('tests.gid')::uuid $$;

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('carol');
select tests.create_user('dan');
select tests.create_user('erin');
select tests.create_user('frank');
select tests.create_user('admin', true);
select tests.create_guest('guest');

----------------------------------------------------------------------------
-- FIXTURE
----------------------------------------------------------------------------
insert into public.places (id, slug, name, province, lat, lng) values
  ('c5100000-0000-0000-0000-000000000001', 'test-s51-p1', 'Luogo 1', 'CT', 37.79, 14.83),
  ('c5100000-0000-0000-0000-000000000002', 'test-s51-p2', 'Luogo 2', 'CT', 37.7905, 14.83),
  ('c5100000-0000-0000-0000-000000000003', 'test-s51-p3', 'Luogo 3', 'CT', 37.80, 14.83),
  ('c5100000-0000-0000-0000-000000000004', 'test-s51-p4', 'Luogo 4', 'CT', 37.79, 14.831),
  ('c5100000-0000-0000-0000-000000000005', 'test-s51-p5', 'Luogo 5', 'CT', 37.81, 14.83),
  ('c5100000-0000-0000-0000-000000000006', 'test-s51-p6', 'Luogo 6', 'CT', 37.82, 14.83),
  ('c5100000-0000-0000-0000-000000000007', 'test-s51-p7', 'Luogo 7', 'CT', 37.83, 14.83);

insert into public.activities (id, slug, place_id, title, duration_min, is_active) values
  ('a5100000-0000-0000-0000-000000000001', 'test-s51-a', 'c5100000-0000-0000-0000-000000000001', 'Attività A', 60, true),
  ('a5100000-0000-0000-0000-000000000002', 'test-s51-b', 'c5100000-0000-0000-0000-000000000002', 'Attività B', 60, true),
  ('a5100000-0000-0000-0000-000000000003', 'test-s51-c', 'c5100000-0000-0000-0000-000000000003', 'Attività C', 60, false);

insert into public.itineraries (id, owner_id, title, days)
values ('e5100000-0000-0000-0000-000000000001', tests.uid('alice'), 'Viaggio 5.1', 3);

insert into public.itinerary_items (id, itinerary_id, day_index, position, place_id) values
  ('f5100000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000001', 0, 0, 'c5100000-0000-0000-0000-000000000001'),
  ('f5100000-0000-0000-0000-000000000002', 'e5100000-0000-0000-0000-000000000001', 0, 1, 'c5100000-0000-0000-0000-000000000002'),
  ('f5100000-0000-0000-0000-000000000003', 'e5100000-0000-0000-0000-000000000001', 0, 2, 'c5100000-0000-0000-0000-000000000003'),
  ('f5100000-0000-0000-0000-000000000004', 'e5100000-0000-0000-0000-000000000001', 0, 3, 'c5100000-0000-0000-0000-000000000004'),
  ('f5100000-0000-0000-0000-000000000005', 'e5100000-0000-0000-0000-000000000001', 0, 4, 'c5100000-0000-0000-0000-000000000005'),
  ('f5100000-0000-0000-0000-000000000006', 'e5100000-0000-0000-0000-000000000001', 0, 5, 'c5100000-0000-0000-0000-000000000006'),
  ('f5100000-0000-0000-0000-000000000007', 'e5100000-0000-0000-0000-000000000001', 0, 6, 'c5100000-0000-0000-0000-000000000007');

insert into public.itinerary_items (id, itinerary_id, day_index, position, custom_title) values
  ('f5100000-0000-0000-0000-000000000008', 'e5100000-0000-0000-0000-000000000001', 0, 7, 'Senza luogo');

insert into public.itinerary_items (id, itinerary_id, day_index, position, activity_id) values
  ('f5100000-0000-0000-0000-000000000009', 'e5100000-0000-0000-0000-000000000001', 1, 0, 'a5100000-0000-0000-0000-000000000001');

select tests.authenticate_as('alice');
select set_config('tests.gid', public.create_group('Gruppo 5.1', 'e5100000-0000-0000-0000-000000000001')::text, true);
reset role;
insert into public.group_members (group_id, user_id) values (tests.gid(), tests.uid('bob'));
insert into public.group_members (group_id, user_id, invited_by) values (tests.gid(), tests.uid('dan'), tests.uid('alice'));

----------------------------------------------------------------------------
-- CHECK-IN: proprietario
----------------------------------------------------------------------------
select tests.authenticate_as('alice');
select is(
  (public.record_check_in('f5100000-0000-0000-0000-000000000001', 37.79, 14.83)->>'points')::int,
  10,
  'check-in: il proprietario ottiene 10 punti'
);
select throws_ok(
  $$select public.record_check_in('f5100000-0000-0000-0000-000000000001', 37.79, 14.83)$$,
  'P0001', 'already_checked_in',
  'check-in: lo stesso luogo lo stesso giorno non si ripete'
);
select throws_ok(
  $$select public.record_check_in('f5100000-0000-0000-0000-000000000007', 37.79, 14.83)$$,
  'P0001', 'too_far',
  'check-in: oltre 300 m dal luogo'
);
select throws_ok(
  $$select public.record_check_in('f5100000-0000-0000-0000-000000000008', 37.79, 14.83)$$,
  'P0001', 'no_place',
  'check-in: tappa senza luogo'
);
select throws_ok(
  $$select public.record_check_in('f5100000-0000-0000-0000-000000000001', 91, 14.83)$$,
  'P0001', 'invalid_position',
  'check-in: coordinate fuori dal range'
);
select is(
  (public.record_check_in('f5100000-0000-0000-0000-000000000002', 37.7905, 14.83)->>'itineraryCompleted')::boolean,
  false,
  'check-in: il secondo luogo non chiude l''itinerario'
);
select is(
  (public.record_check_in('f5100000-0000-0000-0000-000000000003', 37.80, 14.83)->>'itineraryCompleted')::boolean,
  true,
  'check-in: il terzo luogo distinto chiude l''itinerario'
);
select is(
  (public.record_check_in('f5100000-0000-0000-0000-000000000004', 37.79, 14.831)->>'itineraryCompleted')::boolean,
  false,
  'check-in: il premio dell''itinerario si dà una volta sola'
);
select is(
  (public.record_check_in('f5100000-0000-0000-0000-000000000005', 37.81, 14.83)->>'points')::int,
  10,
  'check-in: il quinto del giorno vale ancora 10 punti'
);
select throws_ok(
  $$select public.record_check_in('f5100000-0000-0000-0000-000000000006', 37.82, 14.83)$$,
  'P0001', 'daily_limit',
  'check-in: al massimo 5 al giorno'
);
select is(
  (select count(*)::int from public.check_ins),
  5,
  'check-in: sono registrati solo i cinque accettati'
);
select is(
  (select sum(delta)::int from public.points_ledger where reason = 'check_in'),
  50,
  'punti: cinque check-in da 10'
);
select is(
  (select count(*)::int from public.points_ledger where reason = 'itinerary_completed'),
  1,
  'punti: l''itinerario è premiato una volta'
);

----------------------------------------------------------------------------
-- CHECK-IN: membro del gruppo, altri, ospite, anonimo
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('bob');
select is(
  (public.record_check_in('f5100000-0000-0000-0000-000000000004', 37.79, 14.831)->>'points')::int,
  10,
  'membro del gruppo: registra il check-in sulle tappe del viaggio'
);

reset role;
select tests.authenticate_as('carol');
select throws_ok(
  $$select public.record_check_in('f5100000-0000-0000-0000-000000000001', 37.79, 14.83)$$,
  'P0001', 'not_allowed',
  'altro utente: nessun check-in sul viaggio altrui'
);

reset role;
select tests.authenticate_as('guest');
select throws_ok(
  $$select public.record_check_in('f5100000-0000-0000-0000-000000000001', 37.79, 14.83)$$,
  'P0001', 'guest_not_allowed',
  'ospite: nessun check-in'
);

reset role;
select tests.as_anon();
select throws_ok(
  $$select public.record_check_in('f5100000-0000-0000-0000-000000000001', 37.79, 14.83)$$,
  '42501', null,
  'anonimo: nessun check-in'
);

reset role;
select is(
  (select count(*)::int from public.points_ledger where user_id = tests.uid('guest')),
  0,
  'ospite: nessun punto dal check-in'
);
select hasnt_column('public', 'check_ins', 'lat', 'check_ins: la latitudine non si salva');
select hasnt_column('public', 'check_ins', 'lng', 'check_ins: la longitudine non si salva');

----------------------------------------------------------------------------
-- RECENSIONI: idoneità, premio, riscritture, scritture dirette
----------------------------------------------------------------------------
select tests.authenticate_as('alice');
select throws_ok(
  $$select public.submit_review('a5100000-0000-0000-0000-000000000002', 5::smallint, 'Ottimo')$$,
  'P0001', 'not_eligible',
  'recensione: attività che non è in un proprio viaggio'
);
select throws_ok(
  $$select public.submit_review('a5100000-0000-0000-0000-000000000003', 5::smallint, 'Ottimo')$$,
  'P0001', 'activity_not_available',
  'recensione: attività non attiva'
);
select throws_ok(
  $$select public.submit_review('a5100000-0000-0000-0000-000000000001', 0::smallint, 'Ottimo')$$,
  'P0001', 'invalid_rating',
  'recensione: voto fuori da 1 a 5'
);
select throws_ok(
  format($$select public.submit_review('a5100000-0000-0000-0000-000000000001', 4::smallint, %L)$$, repeat('a', 4001)),
  'P0001', 'invalid_text',
  'recensione: testo oltre 4000 caratteri'
);
select is(
  (public.submit_review('a5100000-0000-0000-0000-000000000001', 4::smallint, 'Bella, breve.')->>'rewarded')::boolean,
  false,
  'recensione sotto 80 caratteri: nessun premio'
);
select is(
  (public.submit_review('a5100000-0000-0000-0000-000000000001', 5::smallint, repeat('Ottimo, ', 12))->>'rewarded')::boolean,
  true,
  'recensione da 80 caratteri: premio'
);
select lives_ok(
  $$select public.submit_review('a5100000-0000-0000-0000-000000000001', 5::smallint, repeat('Ottimo, ', 12))$$,
  'recensione: si riscrive la propria'
);
select is(
  (select count(*)::int from public.points_ledger where reason = 'review' and ref_id = 'a5100000-0000-0000-0000-000000000001'),
  1,
  'riscrivere la recensione non riaccredita'
);
select lives_ok(
  $$delete from public.reviews where activity_id = 'a5100000-0000-0000-0000-000000000001'$$,
  'recensione: il proprietario la cancella'
);
select is(
  (public.submit_review('a5100000-0000-0000-0000-000000000001', 5::smallint, repeat('Ottimo, ', 12))->>'rewarded')::boolean,
  true,
  'cancellare e riscrivere: il premio resta, nessun nuovo accredito'
);
select is(
  (select count(*)::int from public.points_ledger where reason = 'review' and ref_id = 'a5100000-0000-0000-0000-000000000001'),
  1,
  'cancellare e riscrivere: una sola riga nel ledger'
);
select throws_ok(
  format($$insert into public.reviews (user_id, activity_id, rating) values (%L, 'a5100000-0000-0000-0000-000000000002', 3)$$, tests.uid('alice')),
  '42501', null,
  'recensione: insert diretto negato'
);
select throws_ok(
  $$update public.reviews set rating = 1$$,
  '42501', null,
  'recensione: update diretto negato'
);

reset role;
select tests.authenticate_as('guest');
select throws_ok(
  $$select public.submit_review('a5100000-0000-0000-0000-000000000001', 5::smallint, 'Ottimo')$$,
  'P0001', 'guest_not_allowed',
  'ospite: non recensisce'
);

reset role;
select tests.authenticate_as('carol');
select throws_ok(
  $$select public.submit_review('a5100000-0000-0000-0000-000000000001', 5::smallint, 'Ottimo')$$,
  'P0001', 'not_eligible',
  'altro utente: non recensisce attività di viaggi altrui'
);

reset role;
insert into public.affiliate_clicks (user_id, activity_id, partner, target_url, subid, context)
values (tests.uid('dan'), 'a5100000-0000-0000-0000-000000000002', 'travelpayouts', 'https://example.com/attivita', 's51-click-dan', 'page');

select tests.authenticate_as('dan');
select is(
  (public.submit_review('a5100000-0000-0000-0000-000000000002', 5::smallint, repeat('Bella, ', 12))->>'rewarded')::boolean,
  true,
  'click di affiliazione: recensione idonea con premio'
);

reset role;
select tests.authenticate_as('bob');
select is(
  (public.submit_review('a5100000-0000-0000-0000-000000000001', 4::smallint, repeat('Ottimo, ', 12))->>'rewarded')::boolean,
  true,
  'membro del gruppo: recensione con premio'
);

reset role;
select tests.as_anon();
select throws_ok(
  $$select public.submit_review('a5100000-0000-0000-0000-000000000001', 5::smallint, 'Ottimo')$$,
  '42501', null,
  'anonimo: non recensisce'
);

----------------------------------------------------------------------------
-- PUBLIC_REVIEWS: premio, nascoste escluse, nessun user_id
----------------------------------------------------------------------------
reset role;
select results_eq(
  $$select display_name, rating::int, rewarded from public.public_reviews
    where activity_id = 'a5100000-0000-0000-0000-000000000001' order by display_name$$,
  $$values ('alice', 5, true), ('bob', 4, true)$$,
  'recensioni pubbliche: nome, voto e premio di chi ha recensito'
);
select results_eq(
  $$select column_name::text collate "default" from information_schema.columns
    where table_schema = 'public' and table_name = 'public_reviews' order by ordinal_position$$,
  $$values ('id'), ('activity_id'), ('rating'), ('body'), ('created_at'), ('display_name'), ('avatar_url'), ('rewarded'), ('author_deleted')$$,
  'public_reviews: senza user_id, con il flag del premio'
);

update public.reviews set hidden_at = now(), hidden_by = tests.uid('admin') where user_id = tests.uid('bob');
select is_empty(
  $$select 1 from public.public_reviews where display_name = 'bob'$$,
  'recensione nascosta: esce dalla vista pubblica'
);
select tests.authenticate_as('bob');
delete from public.reviews where user_id = tests.uid('bob');
reset role;
select is(
  (select count(*)::int from public.reviews where user_id = tests.uid('bob') and hidden_at is not null),
  1,
  'recensione nascosta: l''autore non la cancella'
);

----------------------------------------------------------------------------
-- REPORT_REVIEW
----------------------------------------------------------------------------
select set_config(
  'tests.rev_alice',
  (select id::text from public.reviews where user_id = tests.uid('alice') and activity_id = 'a5100000-0000-0000-0000-000000000001'),
  true
);

select tests.authenticate_as('alice');
select throws_ok(
  $$select public.report_review(current_setting('tests.rev_alice')::uuid, 'spam')$$,
  'P0001', 'cannot_report_own',
  'segnalazione: non la propria recensione'
);

reset role;
select tests.authenticate_as('guest');
select throws_ok(
  $$select public.report_review(current_setting('tests.rev_alice')::uuid, 'spam')$$,
  'P0001', 'guest_not_allowed',
  'ospite: non segnala'
);

reset role;
select tests.authenticate_as('carol');
select lives_ok(
  $$select public.report_review(current_setting('tests.rev_alice')::uuid, 'spam')$$,
  'segnalazione: un altro utente segnala'
);
select lives_ok(
  $$select public.report_review(current_setting('tests.rev_alice')::uuid, 'spam')$$,
  'segnalazione: la seconda volta non dà errore'
);
select throws_ok(
  $$select public.report_review(current_setting('tests.rev_alice')::uuid, 'boh')$$,
  'P0001', 'invalid_reason',
  'segnalazione: motivo non previsto'
);
select is_empty(
  $$select 1 from public.review_reports$$,
  'segnalazioni: l''utente non le legge'
);

reset role;
select is(
  (select count(*)::int from public.review_reports where reporter_id = tests.uid('carol')),
  1,
  'segnalazioni: una riga per utente e recensione'
);

reset role;
select tests.authenticate_as('admin');
select results_eq(
  $$select count(*)::int from public.review_reports$$,
  $$values (1)$$,
  'segnalazioni: l''admin le legge'
);

reset role;
select tests.as_anon();
select throws_ok(
  $$select * from public.review_reports$$,
  '42501', null,
  'anonimo: nessuna segnalazione'
);

----------------------------------------------------------------------------
-- POINT_RULES
----------------------------------------------------------------------------
reset role;
select tests.as_anon();
select results_eq(
  $$select count(*)::int from public.point_rules$$,
  $$values (5)$$,
  'regole dei punti: leggibili dagli anonimi'
);
select is(
  (select sum(delta)::int from public.point_rules),
  280,
  'regole dei punti: valori iniziali (50, 100, 100, 20, 10)'
);
select throws_ok(
  $$select public.point_delta('check_in')$$,
  '42501', null,
  'anonimo: point_delta non è chiamabile'
);

reset role;
select tests.authenticate_as('alice');
select throws_ok(
  $$update public.point_rules set delta = 999$$,
  '42501', null,
  'regole dei punti: il client non le modifica'
);
select throws_ok(
  $$insert into public.point_rules (reason, delta) values ('order', 1)$$,
  '42501', null,
  'regole dei punti: il client non ne aggiunge'
);

----------------------------------------------------------------------------
-- CLAIM_ONBOARDING_POINTS E ACCEPT_INVITE
----------------------------------------------------------------------------
-- dan è entrato con l'invito di alice ma non ha ancora completato i gusti.
reset role;
select tests.authenticate_as('dan');
select lives_ok(
  $$select public.claim_onboarding_points()$$,
  'claim: senza gusti completati non fa nulla'
);
reset role;
select is(
  (select count(*)::int from public.points_ledger
    where user_id = tests.uid('alice') and reason = 'invite_accepted' and ref_id = tests.uid('dan')),
  0,
  'claim: nessun premio di invito senza gusti completati'
);

update public.profiles set onboarding_completed_at = now() where id = tests.uid('dan');
select tests.authenticate_as('dan');
select lives_ok(
  $$select public.claim_onboarding_points()$$,
  'claim: profilo completato'
);
select lives_ok(
  $$select public.claim_onboarding_points()$$,
  'claim: la seconda chiamata non dà errore'
);
reset role;
select is(
  (select count(*)::int from public.points_ledger where user_id = tests.uid('dan') and reason = 'profile_completed'),
  1,
  'claim: profilo completato una volta'
);
select is(
  (select count(*)::int from public.points_ledger
    where user_id = tests.uid('alice') and reason = 'invite_accepted' and ref_id = tests.uid('dan')),
  1,
  'claim: premio di invito una volta per invitato'
);

reset role;
insert into public.group_invites (group_id, token_hash, invited_by)
values (tests.gid(), encode(sha256(convert_to('s51-token', 'UTF8')), 'hex'), tests.uid('alice'));
update public.profiles set onboarding_completed_at = now() where id = tests.uid('erin');

select tests.authenticate_as('erin');
select lives_ok(
  $$select public.accept_invite('s51-token')$$,
  'invito: l''invitato con i gusti entra'
);
select lives_ok(
  $$select public.accept_invite('s51-token')$$,
  'invito: già membro, nessun secondo premio'
);

reset role;
select tests.authenticate_as('frank');
select lives_ok(
  $$select public.accept_invite('s51-token')$$,
  'invito: l''invitato senza gusti entra'
);

reset role;
select is(
  (select count(*)::int from public.points_ledger
    where user_id = tests.uid('alice') and reason = 'invite_accepted' and ref_id = tests.uid('erin')),
  1,
  'invito: il premio all''autore vale una volta per invitato'
);
select is(
  (select count(*)::int from public.points_ledger
    where user_id = tests.uid('alice') and reason = 'invite_accepted' and ref_id = tests.uid('frank')),
  0,
  'invito: nessun premio se l''invitato non ha completato i gusti'
);

select tests.authenticate_as('guest');
select lives_ok(
  $$select public.claim_onboarding_points()$$,
  'ospite: il claim non dà errore'
);
reset role;
update public.profiles set onboarding_completed_at = now() where id = tests.uid('guest');
select tests.authenticate_as('guest');
select lives_ok(
  $$select public.claim_onboarding_points()$$,
  'ospite con gusti completati: il claim non dà errore'
);
reset role;
select is(
  (select count(*)::int from public.points_ledger where user_id = tests.uid('guest')),
  0,
  'ospite: nessun punto dall''onboarding'
);

reset role;
select tests.as_anon();
select throws_ok(
  $$select public.claim_onboarding_points()$$,
  '42501', null,
  'anonimo: nessun claim'
);

select * from finish();
rollback;
