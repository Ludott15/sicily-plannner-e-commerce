-- Dati dell'utente: user_constraints, preference_weights, user_taste, user_events.
-- Ruoli: anonimo, proprietario (alice), altro utente (bob), admin.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('admin', true);

-- user_taste lo scrive solo il cron: lo prepariamo come postgres.
insert into public.user_taste (user_id) values (tests.uid('alice'));

----------------------------------------------------------------------------
-- PROPRIETARIO
----------------------------------------------------------------------------
select tests.authenticate_as('alice');

select lives_ok(
  format($$insert into public.user_constraints (user_id, budget_per_day_eur, has_car) values (%L, 120, true)$$, tests.uid('alice')),
  'proprietario: inserisce i propri vincoli'
);
select lives_ok(
  format($$update public.user_constraints set budget_per_day_eur = 150 where user_id = %L$$, tests.uid('alice')),
  'proprietario: modifica i propri vincoli'
);
select results_eq(
  $$select budget_per_day_eur from public.user_constraints$$,
  $$values (150)$$,
  'proprietario: legge solo i propri vincoli'
);
select throws_ok(
  format($$insert into public.user_constraints (user_id) values (%L)$$, tests.uid('bob')),
  '42501', null, 'proprietario: non inserisce vincoli per un altro utente'
);

select lives_ok(
  format($$insert into public.preference_weights (user_id, interest_key, explicit) values (%L, 'sea', 4)$$, tests.uid('alice')),
  'proprietario: inserisce un peso esplicito'
);
select lives_ok(
  format($$update public.preference_weights set explicit = 5 where user_id = %L and interest_key = 'sea'$$, tests.uid('alice')),
  'proprietario: modifica il peso esplicito'
);
select throws_ok(
  format($$insert into public.preference_weights (user_id, interest_key, implicit) values (%L, 'art', 2)$$, tests.uid('alice')),
  '42501', null, 'proprietario: non scrive il peso implicito in inserimento'
);
select throws_ok(
  format($$update public.preference_weights set implicit = 2 where user_id = %L$$, tests.uid('alice')),
  '42501', null, 'proprietario: non modifica il peso implicito'
);
select throws_ok(
  format($$insert into public.preference_weights (user_id, interest_key, explicit) values (%L, 'sea', 1)$$, tests.uid('bob')),
  '42501', null, 'proprietario: non inserisce pesi per un altro utente'
);

select results_eq(
  $$select user_id from public.user_taste$$,
  format($$values (%L::uuid)$$, tests.uid('alice')),
  'proprietario: legge il proprio user_taste'
);
select throws_ok(
  format($$update public.user_taste set updated_at = now() where user_id = %L$$, tests.uid('alice')),
  '42501', null, 'proprietario: non modifica user_taste'
);
select throws_ok(
  format($$insert into public.user_taste (user_id) values (%L)$$, tests.uid('alice')),
  '42501', null, 'proprietario: non inserisce user_taste'
);

select lives_ok(
  format($$insert into public.user_events (user_id, type) values (%L, 'view')$$, tests.uid('alice')),
  'proprietario: registra un proprio evento'
);
select throws_ok(
  format($$insert into public.user_events (user_id, type) values (%L, 'view')$$, tests.uid('bob')),
  '42501', null, 'proprietario: non registra eventi per un altro utente'
);
select throws_ok($$select * from public.user_events$$, '42501', null, 'proprietario: non rilegge gli eventi');
select throws_ok(
  $$update public.user_events set processed_at = now()$$,
  '42501', null, 'proprietario: non marca gli eventi come processati'
);
select throws_ok(
  format($$insert into public.user_events (user_id, type, processed_at) values (%L, 'view', now())$$, tests.uid('alice')),
  '42501', null, 'proprietario: non imposta processed_at'
);

----------------------------------------------------------------------------
-- ALTRO UTENTE
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('bob');

select is_empty($$select 1 from public.user_constraints$$, 'altro utente: non legge i vincoli di alice');
select is_empty($$select 1 from public.preference_weights$$, 'altro utente: non legge i pesi di alice');
select is_empty($$select 1 from public.user_taste$$, 'altro utente: non legge user_taste di alice');
select throws_ok($$select * from public.user_events$$, '42501', null, 'altro utente: non legge gli eventi');

update public.user_constraints set budget_per_day_eur = 1;
update public.preference_weights set explicit = 0;
delete from public.user_constraints;
delete from public.preference_weights;

reset role;
select is(
  (select budget_per_day_eur from public.user_constraints where user_id = tests.uid('alice')),
  150,
  'altro utente: update dei vincoli di alice senza effetto'
);
select is(
  (select explicit from public.preference_weights where user_id = tests.uid('alice') and interest_key = 'sea'),
  5::smallint,
  'altro utente: update dei pesi di alice senza effetto'
);
select isnt_empty(
  format($$select 1 from public.user_constraints where user_id = %L$$, tests.uid('alice')),
  'altro utente: delete dei vincoli di alice senza effetto'
);
select isnt_empty(
  format($$select 1 from public.preference_weights where user_id = %L$$, tests.uid('alice')),
  'altro utente: delete dei pesi di alice senza effetto'
);

----------------------------------------------------------------------------
-- ADMIN: nessun accesso ai dati personali di altri dal client
----------------------------------------------------------------------------
select tests.authenticate_as('admin');

select is_empty($$select 1 from public.user_constraints$$, 'admin: non legge i vincoli di altri');
select is_empty($$select 1 from public.preference_weights$$, 'admin: non legge i pesi di altri');
select is_empty($$select 1 from public.user_taste$$, 'admin: non legge user_taste di altri');
select throws_ok($$select * from public.user_events$$, '42501', null, 'admin: non legge gli eventi');

update public.user_constraints set budget_per_day_eur = 1;
reset role;
select is(
  (select budget_per_day_eur from public.user_constraints where user_id = tests.uid('alice')),
  150,
  'admin: update dei vincoli di altri senza effetto'
);

----------------------------------------------------------------------------
-- ANONIMO
----------------------------------------------------------------------------
select tests.as_anon();

select throws_ok($$select * from public.user_constraints$$, '42501', null, 'anon: non legge user_constraints');
select throws_ok($$select * from public.preference_weights$$, '42501', null, 'anon: non legge preference_weights');
select throws_ok($$select * from public.user_taste$$, '42501', null, 'anon: non legge user_taste');
select throws_ok(
  format($$insert into public.user_events (user_id, type) values (%L, 'view')$$, tests.uid('alice')),
  '42501', null, 'anon: non registra eventi'
);
select throws_ok(
  format($$insert into public.user_constraints (user_id) values (%L)$$, tests.uid('alice')),
  '42501', null, 'anon: non inserisce vincoli'
);

select * from finish();
rollback;
