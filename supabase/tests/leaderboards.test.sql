-- Classifiche (passo 5.3): stagioni, top 50 senza opt-out, posizione propria, nessuno storico
-- esposto, nome pubblico, impostazioni via funzioni (ospiti esclusi), classifica di gruppo solo
-- per i membri e nel periodo del viaggio, premi di stagione (solo admin, chiusura una volta sola).
-- Le stagioni di prova (2001-estate, 2030-estate) sono lontane dai dati del database locale.
-- Ruoli: anonimo, proprietario (alice), altri utenti (bob, carol, dan), admin, ospite.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('carol');
select tests.create_user('dan');
select tests.create_user('admin', true);
select tests.create_guest('guest');

----------------------------------------------------------------------------
-- STAGIONI E NOME PUBBLICO (funzioni pure)
----------------------------------------------------------------------------
select is(public.season_for('2026-03-31 23:59:00+02'::timestamptz), '2025-inverno', 'stagioni: 31 marzo alle 23:59 è ancora inverno');
select is(public.season_for('2026-04-01 00:00:00+02'::timestamptz), '2026-estate', 'stagioni: 1 aprile alle 00:00 è estate');
select is(public.season_for('2026-09-30 23:59:00+02'::timestamptz), '2026-estate', 'stagioni: 30 settembre alle 23:59 è estate');
select is(public.season_for('2026-10-01 00:00:00+02'::timestamptz), '2026-inverno', 'stagioni: 1 ottobre alle 00:00 è inverno');

select is(public.public_name_for(null, 'Mario Rossi'), 'M. R.', 'nome pubblico: senza nome scelto, iniziali di nome e cognome');
select is(public.public_name_for('  Giulia ', 'Mario Rossi'), 'Giulia', 'nome pubblico: il nome scelto vince, senza spazi');
select is(public.public_name_for(null, 'Mario Giuseppe Rossi'), 'M. R.', 'nome pubblico: prima e ultima parola');
select is(public.public_name_for('', 'Mario'), 'M.', 'nome pubblico: nome di una parola, con il punto');
select is(public.public_name_for(null, null), 'Viaggiatore', 'nome pubblico: senza alcun nome non espone nulla');

----------------------------------------------------------------------------
-- DATI DI PROVA: stagione 2001-estate (classifica)
----------------------------------------------------------------------------
insert into public.points_ledger (user_id, delta, reason, ref_type, ref_id, season, created_at)
values
  (tests.uid('alice'), 60, 'review', 'test', gen_random_uuid(), '2001-estate', '2001-06-01 10:00+02'),
  (tests.uid('alice'), -20, 'redeem', 'test', gen_random_uuid(), '2001-estate', '2001-06-02 10:00+02'),
  (tests.uid('bob'), 90, 'review', 'test', gen_random_uuid(), '2001-estate', '2001-06-01 10:00+02'),
  (tests.uid('carol'), 30, 'check_in', 'test', gen_random_uuid(), '2001-estate', '2001-06-01 10:00+02'),
  (tests.uid('dan'), 40, 'profile_completed', 'test', tests.uid('dan'), '2001-estate', '2001-06-01 10:00+02');

-- Carol sceglie di non comparire (con la funzione, come farebbe l'utente).
select tests.authenticate_as('carol');
select lives_ok($$select public.set_leaderboard_opt_out(true)$$, 'opt-out: carol sceglie di non comparire');
reset role;

-- Cinquantadue utenti in più con un punto ciascuno: la lista si ferma a cinquanta.
select tests.create_user('bulk' || g) from generate_series(1, 52) as g;
insert into public.points_ledger (user_id, delta, reason, ref_type, ref_id, season, created_at)
select p.id, 1, 'review', 'test', gen_random_uuid(), '2001-estate', '2001-06-01 10:00+02'
from public.profiles p
where p.display_name like 'bulk%';

select public.refresh_leaderboard();

----------------------------------------------------------------------------
-- CLASSIFICA STAGIONALE: contenuto, limiti, esclusioni
----------------------------------------------------------------------------
select is(
  pg_get_function_result('public.seasonal_leaderboard_top(text,integer)'::regprocedure),
  'TABLE(rank integer, public_name text, points integer, is_me boolean)',
  'classifica: la funzione restituisce solo posizione, nome pubblico, punti e is_me'
);

select tests.authenticate_as('alice');
select results_eq(
  $$select rank, public_name, points, is_me from public.seasonal_leaderboard_top('2001-estate', 3)$$,
  $$values (1, 'bob', 90, false), (2, 'alice', 60, true), (3, 'dan', 40, false)$$,
  'classifica: ordine per punti senza redeem, is_me solo per la propria riga'
);
select results_eq(
  $$select count(*)::int from public.seasonal_leaderboard_top('2001-estate', 500)$$,
  $$values (50)$$,
  'classifica: al massimo cinquanta righe, anche se se ne chiedono di più'
);
select is_empty(
  $$select 1 from public.seasonal_leaderboard_top('2001-estate', 500) where public_name = 'carol'$$,
  'classifica: chi è in opt-out non compare'
);
select is_empty(
  $$select 1 from public.seasonal_leaderboard_top('2001-estate', 500) where public_name like '%@%'$$,
  'classifica: nessuna email tra i nomi pubblici'
);
select throws_ok(
  $$select * from public.seasonal_leaderboard_top('2001-autunno')$$,
  'P0001', 'invalid_season', 'classifica: stagione non valida rifiutata'
);

----------------------------------------------------------------------------
-- POSIZIONE PROPRIA: anche in opt-out, mai per gli ospiti o gli anonimi
----------------------------------------------------------------------------
select results_eq(
  $$select rank, points from public.my_seasonal_rank('2001-estate')$$,
  $$values (2, 60)$$,
  'posizione: alice è seconda con 60 punti (il redeem non conta)'
);
select tests.authenticate_as('carol');
select results_eq(
  $$select rank, points from public.my_seasonal_rank('2001-estate')$$,
  $$values (4, 30)$$,
  'posizione: carol in opt-out vede la propria posizione tra gli altri (quarta)'
);
select is_empty(
  $$select 1 from public.my_seasonal_rank('2001-inverno')$$,
  'posizione: nessuna riga se l''utente non ha punti nella stagione'
);
reset role;
select tests.authenticate_as('guest');
select throws_ok(
  $$select * from public.my_seasonal_rank('2001-estate')$$,
  'P0001', 'guest_not_allowed', 'posizione: l''ospite non la vede'
);
reset role;
select tests.as_anon();
select throws_ok(
  $$select * from public.my_seasonal_rank('2001-estate')$$,
  '42501', null, 'posizione: l''anonimo non la vede'
);
select isnt_empty(
  $$select 1 from public.seasonal_leaderboard_top('2001-estate')$$,
  'classifica: l''anonimo legge la lista pubblica'
);

----------------------------------------------------------------------------
-- NESSUNO STORICO ESPOSTO
----------------------------------------------------------------------------
select results_eq(
  $$select attname::text collate "default" from pg_attribute
    where attrelid = 'public.leaderboard_season_totals'::regclass and attnum > 0 and not attisdropped
    order by attnum$$,
  $$values ('season'), ('user_id'), ('total_points')$$,
  'classifica: la vista materializzata ha solo stagione, utente e totale (nessuna riga per movimento)'
);
reset role;
select tests.authenticate_as('alice');
select throws_ok(
  $$select * from public.leaderboard_season_totals$$,
  '42501', null, 'classifica: la vista materializzata non è leggibile dal client'
);

----------------------------------------------------------------------------
-- IMPOSTAZIONI: nome pubblico e opt-out via funzioni, ospiti esclusi
----------------------------------------------------------------------------
select results_eq(
  $$select opt_out, display_name, public_name from public.my_leaderboard_settings()$$,
  $$values (false, 'alice', 'alice')$$,
  'impostazioni: alice non è in opt-out e il nome pubblico è il nome dell''account'
);
select lives_ok($$select public.set_public_name('  Alice R.  ')$$, 'nome pubblico: alice imposta il suo nome');
select results_eq(
  $$select public_name from public.my_leaderboard_settings()$$,
  $$values ('Alice R.')$$,
  'nome pubblico: il nome scelto compare nelle impostazioni'
);
select lives_ok($$select public.set_public_name('')$$, 'nome pubblico: testo vuoto');
select results_eq(
  $$select public_name from public.my_leaderboard_settings()$$,
  $$values ('A.')$$,
  'nome pubblico: senza nome scelto torna alle iniziali'
);
select throws_ok(
  $$select public.set_public_name(repeat('x', 41))$$,
  'P0001', 'invalid_name', 'nome pubblico: più di quaranta caratteri rifiutati'
);
select throws_ok(
  $$select public.set_leaderboard_opt_out(null)$$,
  'P0001', 'invalid_value', 'opt-out: il valore nullo è rifiutato'
);
select throws_ok(
  $$update public.profiles set leaderboard_opt_out = true where id = (select auth.uid())$$,
  '42501', null, 'opt-out: il client non può scriverlo direttamente'
);

reset role;
select tests.authenticate_as('guest');
select throws_ok(
  $$select public.set_leaderboard_opt_out(true)$$,
  'P0001', 'guest_not_allowed', 'opt-out: l''ospite non può cambiarlo'
);
select throws_ok(
  $$select public.set_public_name('Ospite')$$,
  'P0001', 'guest_not_allowed', 'nome pubblico: l''ospite non può impostarlo'
);

reset role;
select tests.as_anon();
select throws_ok(
  $$select public.set_public_name('Anonimo')$$,
  '42501', null, 'nome pubblico: l''anonimo non può impostarlo'
);
select throws_ok(
  $$select * from public.my_leaderboard_settings()$$,
  '42501', null, 'impostazioni: l''anonimo non le legge'
);

----------------------------------------------------------------------------
-- CLASSIFICA DI GRUPPO: solo membri, solo nel periodo del viaggio
----------------------------------------------------------------------------
reset role;
insert into public.itineraries (id, owner_id, title, days, start_date)
values ('eeeeeeee-0000-0000-0000-000000000001', tests.uid('alice'), 'Viaggio di prova', 3, '2030-05-01');

select tests.authenticate_as('alice');
select set_config('tests.lb_gid', public.create_group('Gruppo di prova', 'eeeeeeee-0000-0000-0000-000000000001')::text, true);
reset role;
insert into public.group_members (group_id, user_id)
values (current_setting('tests.lb_gid')::uuid, tests.uid('bob'));

-- Dentro il viaggio (1-3 maggio, ora italiana): 15 di alice, 5 di bob. Fuori: 7 di alice (4 maggio),
-- 9 di bob (30 aprile alle 23:30). Il riscatto di bob (-3) non conta.
insert into public.points_ledger (user_id, delta, reason, ref_type, ref_id, season, created_at)
values
  (tests.uid('alice'), 15, 'review', 'test', gen_random_uuid(), '2030-estate', '2030-05-02 12:00+02'),
  (tests.uid('alice'), 7, 'review', 'test', gen_random_uuid(), '2030-estate', '2030-05-04 09:00+02'),
  (tests.uid('bob'), 5, 'check_in', 'test', gen_random_uuid(), '2030-estate', '2030-05-01 00:30+02'),
  (tests.uid('bob'), 9, 'check_in', 'test', gen_random_uuid(), '2030-estate', '2030-04-30 23:30+02'),
  (tests.uid('bob'), -3, 'redeem', 'test', gen_random_uuid(), '2030-estate', '2030-05-02 10:00+02');

select tests.authenticate_as('bob');
select results_eq(
  format($$select public_name, points, is_me, period_from::text, period_to::text from public.group_leaderboard(%L)$$, current_setting('tests.lb_gid')),
  $$values ('A.', 15, false, '2030-05-01', '2030-05-03'), ('bob', 5, true, '2030-05-01', '2030-05-03')$$,
  'gruppo: il membro vede i punti del viaggio, senza riscatti e fuori dal periodo, con il periodo'
);

reset role;
select tests.authenticate_as('dan');
select throws_ok(
  format($$select 1 from public.group_leaderboard(%L)$$, current_setting('tests.lb_gid')),
  'P0001', 'not_group_member', 'gruppo: un non membro non riceve i dati'
);

reset role;
select tests.as_anon();
select throws_ok(
  format($$select 1 from public.group_leaderboard(%L)$$, current_setting('tests.lb_gid')),
  '42501', null, 'gruppo: l''anonimo non può chiamarla'
);

----------------------------------------------------------------------------
-- PREMI DI STAGIONE: solo admin, chiusura una volta sola
----------------------------------------------------------------------------
reset role;
select is(public.close_season('2001-estate'), 10, 'premi: la chiusura fotografa i primi dieci non in opt-out');
select is(public.close_season('2001-estate'), 0, 'premi: una stagione già chiusa non si riscrive');
select results_eq(
  $$select rank::int, points from public.season_awards where season = '2001-estate' and rank <= 3 order by rank$$,
  $$values (1, 90), (2, 60), (3, 40)$$,
  'premi: posti e punti nell''ordine della classifica'
);
select is_empty(
  $$select 1 from public.season_awards sa join public.profiles p on p.id = sa.user_id where p.display_name = 'carol'$$,
  'premi: chi è in opt-out non entra nei premi'
);
select throws_ok(
  $$select public.close_season('2001-autunno')$$,
  'P0001', 'invalid_season', 'premi: stagione non valida rifiutata'
);

select tests.authenticate_as('alice');
select throws_ok(
  $$select public.close_season('2001-estate')$$,
  '42501', null, 'premi: il client non chiude le stagioni'
);
select is_empty($$select 1 from public.season_awards$$, 'premi: un utente non admin non legge i premi');

reset role;
select tests.authenticate_as('bob');
select is_empty($$select 1 from public.season_awards$$, 'premi: altro utente non legge i premi');

reset role;
select tests.authenticate_as('admin');
select results_eq(
  $$select count(*)::int from public.season_awards where season = '2001-estate'$$,
  $$values (10)$$,
  'premi: l''admin legge i premi della stagione'
);
select throws_ok(
  $$update public.season_awards set prize_status = 'shipped'$$,
  '42501', null, 'premi: l''admin non modifica i premi dal client'
);

reset role;
select tests.as_anon();
select throws_ok(
  $$select * from public.season_awards$$,
  '42501', null, 'premi: l''anonimo non li legge'
);

reset role;
select throws_ok(
  $$insert into public.season_awards (season, rank, points) values ('2001-estate', 11, 1)$$,
  '23514', null, 'premi: il posto va da 1 a 10'
);
select throws_ok(
  $$insert into public.season_awards (season, rank, points, prize_status) values ('2001-estate', 11, 1, 'bogus')$$,
  '23514', null, 'premi: stato del premio non valido rifiutato'
);

select * from finish();
rollback;
