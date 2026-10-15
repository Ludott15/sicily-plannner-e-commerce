-- Gamification: award_points, points_ledger (immutabile), badges, user_badges, check_ins,
-- reviews e public_reviews, classifiche stagionale e di gruppo.
-- Ruoli: anonimo, proprietario (alice), altro utente (bob), admin; per il gruppo anche membro.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('carol');
select tests.create_user('dan');
select tests.create_user('admin', true);

insert into public.places (id, slug, name, province, lat, lng)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'test-bronte', 'Bronte', 'CT', 37.79, 14.83);
insert into public.activities (id, slug, place_id, title, duration_min, is_active)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'test-pistacchio', 'aaaaaaaa-0000-0000-0000-000000000001', 'Pistacchio', 120, true),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'test-chiusa', 'aaaaaaaa-0000-0000-0000-000000000001', 'Chiusa', 60, false);

----------------------------------------------------------------------------
-- STAGIONI
----------------------------------------------------------------------------
select is(public.season_for('2027-01-15 12:00+01'), '2026-inverno', 'season_for: gennaio appartiene all''inverno iniziato l''anno prima');
select is(public.season_for('2027-04-01 00:30+02'), '2027-estate', 'season_for: aprile è estate');
select is(public.season_for('2026-09-30 23:30+00'), '2026-inverno', 'season_for: usa l''ora italiana (1 ottobre alle 01:30)');

----------------------------------------------------------------------------
-- AWARD_POINTS: idempotenza
----------------------------------------------------------------------------
select is(
  public.award_points(tests.uid('alice'), 50, 'profile_completed', 'profile', tests.uid('alice')),
  true,
  'award_points: primo accredito'
);
select is(
  public.award_points(tests.uid('alice'), 50, 'profile_completed', 'profile', tests.uid('alice')),
  false,
  'award_points: la stessa azione una seconda volta non accredita'
);
select is(
  (select count(*)::int from public.points_ledger where user_id = tests.uid('alice') and reason = 'profile_completed'),
  1,
  'award_points: una sola riga nel ledger'
);
select is(
  public.award_points(tests.uid('alice'), 20, 'review', 'review', 'bbbbbbbb-0000-0000-0000-000000000001'),
  true,
  'award_points: stesso motivo con riferimento diverso accredita'
);
select is(
  (select season from public.points_ledger where user_id = tests.uid('alice') and reason = 'review'),
  public.season_for(now()),
  'award_points: assegna la stagione corrente'
);
select public.award_points(tests.uid('alice'), -10, 'redeem', 'order', gen_random_uuid());
select public.award_points(tests.uid('bob'), 10, 'check_in', 'check_in', gen_random_uuid());
select public.award_points(tests.uid('carol'), 30, 'profile_completed', 'profile', tests.uid('carol'));
select public.award_points(tests.uid('dan'), 40, 'profile_completed', 'profile', tests.uid('dan'));
select throws_ok(
  $$select public.award_points(gen_random_uuid(), 0, 'admin_adjust', 'x', gen_random_uuid())$$,
  '23514', null, 'award_points: delta zero rifiutato'
);

select tests.authenticate_as('alice');
select throws_ok(
  format($$select public.award_points(%L, 1000, 'admin_adjust', 'x', gen_random_uuid())$$, tests.uid('alice')),
  '42501', null, 'award_points: il client non può accreditarsi punti'
);
reset role;
select tests.authenticate_as('admin');
select throws_ok(
  format($$select public.award_points(%L, 1000, 'admin_adjust', 'x', gen_random_uuid())$$, tests.uid('admin')),
  '42501', null, 'award_points: nemmeno l''admin dal client'
);
reset role;
select tests.as_anon();
select throws_ok(
  format($$select public.award_points(%L, 1000, 'admin_adjust', 'x', gen_random_uuid())$$, tests.uid('alice')),
  '42501', null, 'award_points: anon non può chiamarla'
);

----------------------------------------------------------------------------
-- POINTS_LEDGER: lettura e immutabilità
----------------------------------------------------------------------------
select throws_ok($$select * from public.points_ledger$$, '42501', null, 'anon: non legge il ledger');

reset role;
select tests.authenticate_as('alice');
select results_eq(
  $$select count(*)::int from public.points_ledger$$,
  $$values (3)$$,
  'proprietario: legge solo il proprio storico'
);
select throws_ok(
  format($$insert into public.points_ledger (user_id, delta, reason, ref_type, ref_id, season) values (%L, 5, 'review', 'x', gen_random_uuid(), '2026-estate')$$, tests.uid('alice')),
  '42501', null, 'proprietario: non scrive nel ledger'
);
select throws_ok($$update public.points_ledger set delta = 1000$$, '42501', null, 'proprietario: non modifica il ledger');
select throws_ok($$delete from public.points_ledger$$, '42501', null, 'proprietario: non cancella dal ledger');

reset role;
select tests.authenticate_as('bob');
select results_eq(
  $$select count(*)::int from public.points_ledger$$,
  $$values (1)$$,
  'altro utente: vede solo il proprio storico, non quello di alice'
);

reset role;
select tests.authenticate_as('admin');
select is_empty($$select 1 from public.points_ledger$$, 'admin: non legge lo storico degli altri dal client');
select throws_ok($$update public.points_ledger set delta = 1000$$, '42501', null, 'admin: update del ledger rifiutato');
select throws_ok($$delete from public.points_ledger$$, '42501', null, 'admin: delete del ledger rifiutato');

-- Anche con il ruolo postgres (dbAdmin) il trigger rifiuta update, delete e truncate.
reset role;
select throws_ok(
  format($$update public.points_ledger set delta = 1000 where user_id = %L$$, tests.uid('alice')),
  'P0001', 'points_ledger_immutable', 'postgres: update del ledger rifiutato dal trigger'
);
select throws_ok(
  format($$delete from public.points_ledger where user_id = %L$$, tests.uid('alice')),
  'P0001', 'points_ledger_immutable', 'postgres: delete del ledger rifiutato dal trigger'
);
select throws_ok($$truncate public.points_ledger$$, 'P0001', 'points_ledger_immutable', 'postgres: truncate del ledger rifiutato');

----------------------------------------------------------------------------
-- CLASSIFICA STAGIONALE
----------------------------------------------------------------------------
select tests.authenticate_as('carol');
update public.profiles set leaderboard_opt_out = true where id = tests.uid('carol');
select throws_ok(
  format($$update public.profiles set role = 'admin' where id = %L$$, tests.uid('carol')),
  '42501', null, 'profiles: con il nuovo grant su leaderboard_opt_out il ruolo resta non modificabile'
);
reset role;
select public.refresh_leaderboard();

select tests.authenticate_as('alice');
select results_eq(
  $$select display_name, total_points, rank, is_me from public.seasonal_leaderboard
    where season = public.season_for(now()) and display_name in ('alice', 'bob', 'carol', 'dan')
    order by rank$$,
  $$values ('alice', 70, 1, true), ('dan', 40, 2, false), ('bob', 10, 3, false)$$,
  'classifica: totali senza redeem, is_me per la propria riga, esclusi gli utenti che hanno scelto di non comparire'
);
select results_eq(
  $$select column_name::text collate "default" from information_schema.columns
    where table_schema = 'public' and table_name = 'seasonal_leaderboard' order by ordinal_position$$,
  $$values ('season'), ('rank'), ('display_name'), ('avatar_url'), ('total_points'), ('is_me')$$,
  'classifica: la vista espone solo stagione, posizione, nome, avatar, totale e is_me'
);
select throws_ok($$select * from public.leaderboard_season_totals$$, '42501', null, 'classifica: la vista materializzata non è leggibile dal client');
select throws_ok($$select public.refresh_leaderboard()$$, '42501', null, 'classifica: il client non forza il refresh');

reset role;
select tests.as_anon();
select throws_ok($$select * from public.seasonal_leaderboard$$, '42501', null, 'anon: non legge la classifica');

----------------------------------------------------------------------------
-- CLASSIFICA DI GRUPPO
----------------------------------------------------------------------------
reset role;
insert into public.itineraries (id, owner_id, title, days, start_date)
values ('dddddddd-0000-0000-0000-000000000001', tests.uid('alice'), 'Viaggio', 3, (now() at time zone 'Europe/Rome')::date);
select tests.authenticate_as('alice');
select set_config('tests.gid', public.create_group('Gruppo', 'dddddddd-0000-0000-0000-000000000001')::text, true);
reset role;
insert into public.group_members (group_id, user_id) values (current_setting('tests.gid')::uuid, tests.uid('bob'));

select tests.authenticate_as('bob');
select results_eq(
  format($$select display_name, total_points, is_me from public.group_leaderboard(%L)$$, current_setting('tests.gid')),
  $$values ('alice', 70, false), ('bob', 10, true)$$,
  'classifica di gruppo: il membro vede i punti del viaggio dei membri'
);
reset role;
select tests.authenticate_as('dan');
select is_empty(
  format($$select 1 from public.group_leaderboard(%L)$$, current_setting('tests.gid')),
  'classifica di gruppo: un non membro non riceve righe'
);

----------------------------------------------------------------------------
-- BADGES E USER_BADGES
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('admin');
select lives_ok(
  $$insert into public.badges (key, name_it, name_en, criteria) values ('test-primo-viaggio', 'Primo viaggio', 'First trip', '{"type": "itineraries_completed", "min": 1}')$$,
  'admin: crea un badge'
);
reset role;
select tests.authenticate_as('alice');
select throws_ok(
  $$insert into public.badges (key, name_it, name_en, criteria) values ('test_x', 'x', 'x', '{}')$$,
  '42501', null, 'utente: non crea badge'
);
select throws_ok(
  format($$insert into public.user_badges (user_id, badge_key) values (%L, 'test-primo-viaggio')$$, tests.uid('alice')),
  '42501', null, 'proprietario: non si assegna badge'
);
reset role;
insert into public.user_badges (user_id, badge_key) values (tests.uid('alice'), 'test-primo-viaggio');
select tests.authenticate_as('alice');
select results_eq($$select badge_key from public.user_badges$$, $$values ('test-primo-viaggio')$$, 'proprietario: vede i propri badge');
reset role;
select tests.authenticate_as('bob');
select is_empty($$select 1 from public.user_badges$$, 'altro utente: non vede i badge di alice');
reset role;
select tests.authenticate_as('admin');
select is_empty($$select 1 from public.user_badges$$, 'admin: non vede i badge degli altri dal client');
reset role;
select tests.as_anon();
select isnt_empty($$select 1 from public.badges where key = 'test-primo-viaggio'$$, 'anon: legge il catalogo dei badge');
select throws_ok($$select * from public.user_badges$$, '42501', null, 'anon: non legge user_badges');
reset role;
select throws_ok(
  format($$delete from public.user_badges where user_id = %L$$, tests.uid('alice')),
  'P0001', 'user_badges_immutable', 'postgres: delete di user_badges rifiutato dal trigger'
);
select throws_ok(
  $$update public.user_badges set awarded_at = now()$$,
  'P0001', 'user_badges_immutable', 'postgres: update di user_badges rifiutato dal trigger'
);

----------------------------------------------------------------------------
-- CHECK_INS
----------------------------------------------------------------------------
insert into public.check_ins (user_id, place_id)
values (tests.uid('alice'), 'aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok(
  format($$insert into public.check_ins (user_id, place_id) values (%L, 'aaaaaaaa-0000-0000-0000-000000000001')$$, tests.uid('alice')),
  '23505', null, 'check_ins: un solo check-in per luogo al giorno'
);
select tests.authenticate_as('alice');
select results_eq($$select count(*)::int from public.check_ins$$, $$values (1)$$, 'proprietario: vede i propri check-in');
select throws_ok(
  format($$insert into public.check_ins (user_id, place_id) values (%L, 'aaaaaaaa-0000-0000-0000-000000000001')$$, tests.uid('alice')),
  '42501', null, 'proprietario: non registra check-in direttamente'
);
reset role;
select tests.authenticate_as('bob');
select is_empty($$select 1 from public.check_ins$$, 'altro utente: non vede i check-in di alice');
reset role;
select tests.authenticate_as('admin');
select is_empty($$select 1 from public.check_ins$$, 'admin: non vede i check-in degli altri dal client');
reset role;
select tests.as_anon();
select throws_ok($$select * from public.check_ins$$, '42501', null, 'anon: non legge i check-in');

----------------------------------------------------------------------------
-- REVIEWS E PUBLIC_REVIEWS
----------------------------------------------------------------------------
reset role;
insert into public.reviews (user_id, activity_id, rating, body)
values (tests.uid('bob'), 'bbbbbbbb-0000-0000-0000-000000000002', 2, 'Attività ora disattivata');

-- Le recensioni passano da submit_review (points_checkins_reviews.test.sql): il client non le scrive.
reset role;
insert into public.reviews (user_id, activity_id, rating, body)
values (tests.uid('alice'), 'bbbbbbbb-0000-0000-0000-000000000001', 5, 'Ottimo');

select tests.authenticate_as('alice');
select throws_ok(
  format($$insert into public.reviews (user_id, activity_id, rating) values (%L, 'bbbbbbbb-0000-0000-0000-000000000001', 1)$$, tests.uid('bob')),
  '42501', null, 'proprietario: non scrive recensioni a nome di altri'
);
select throws_ok(
  format($$insert into public.reviews (user_id, activity_id, rating) values (%L, 'bbbbbbbb-0000-0000-0000-000000000001', 3)$$, tests.uid('alice')),
  '42501', null, 'proprietario: il client non scrive recensioni direttamente'
);
select throws_ok(
  $$update public.reviews set rating = 4 where activity_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  '42501', null, 'proprietario: il client non modifica le recensioni direttamente'
);

reset role;
select tests.authenticate_as('bob');
select is_empty(
  format($$select 1 from public.reviews where user_id = %L$$, tests.uid('alice')),
  'altro utente: non legge la tabella reviews di alice'
);
select throws_ok(
  $$update public.reviews set rating = 1 where activity_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  '42501', null, 'altro utente: non modifica la recensione di alice'
);
delete from public.reviews where activity_id = 'bbbbbbbb-0000-0000-0000-000000000001';
select results_eq(
  $$select display_name, rating from public.public_reviews where activity_id::text like 'bbbbbbbb-%'$$,
  $$values ('alice', 5::smallint)$$,
  'altro utente: legge la recensione di alice tramite public_reviews, non quelle di attività inattive'
);

reset role;
select tests.authenticate_as('admin');
select is_empty(
  format($$select 1 from public.reviews where user_id = %L$$, tests.uid('alice')),
  'admin: non legge la tabella reviews degli altri dal client'
);

reset role;
select tests.as_anon();
select isnt_empty(
  $$select 1 from public.public_reviews where activity_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  'anon: legge le recensioni pubbliche'
);
select throws_ok($$select * from public.reviews$$, '42501', null, 'anon: non legge la tabella reviews');
select results_eq(
  $$select column_name::text collate "default" from information_schema.columns
    where table_schema = 'public' and table_name = 'public_reviews' order by ordinal_position$$,
  $$values ('id'), ('activity_id'), ('rating'), ('body'), ('created_at'), ('display_name'), ('avatar_url'), ('rewarded')$$,
  'public_reviews: espone nome e avatar dell''autore, il premio, senza user_id'
);

----------------------------------------------------------------------------
-- ELIMINAZIONE DELL'ACCOUNT: unica eccezione all'immutabilità
----------------------------------------------------------------------------
reset role;
select lives_ok(
  format($$delete from auth.users where id = %L$$, tests.uid('alice')),
  'eliminazione account: ledger e badge si cancellano a cascata'
);
select is_empty(
  format($$select 1 from public.points_ledger where user_id = %L$$, tests.uid('alice')),
  'eliminazione account: nessuna riga residua nel ledger'
);

select * from finish();
rollback;
