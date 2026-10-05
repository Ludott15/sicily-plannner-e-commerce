-- Onboarding (M4): giorni e mesi del viaggio in user_constraints, ritmo e compagnia in
-- profiles, pesi espliciti in preference_weights. Dati personali: ognuno scrive e legge solo
-- i propri, ospite compreso. Ruoli: anonimo, utente, ospite, altro utente, admin.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_guest('guest');
select tests.create_user('bob');
select tests.create_user('admin', true);

----------------------------------------------------------------------------
-- PROPRIETARIO: utente e ospite scrivono le proprie risposte
----------------------------------------------------------------------------
select tests.authenticate_as('alice');
select lives_ok(
  format($$insert into public.user_constraints (user_id, budget_per_day_eur, has_car, trip_days, trip_months)
           values (%L, 90, true, 4, '{5,6}')$$, tests.uid('alice')),
  'utente: salva giorni e mesi del viaggio'
);
select lives_ok(
  format($$update public.profiles set pace = 'relaxed', party = 'couple', onboarding_completed_at = now() where id = %L$$, tests.uid('alice')),
  'utente: salva ritmo e compagnia'
);
select lives_ok(
  format($$insert into public.preference_weights (user_id, interest_key, explicit) values (%L, 'sea', 5), (%L, 'food_wine', 3)$$,
    tests.uid('alice'), tests.uid('alice')),
  'utente: salva i pesi espliciti'
);
select results_eq(
  $$select trip_days, trip_months from public.user_constraints$$,
  $$values (4::smallint, '{5,6}'::smallint[])$$,
  'utente: rilegge le proprie risposte'
);
select throws_ok(
  format($$update public.preference_weights set implicit = 2 where user_id = %L$$, tests.uid('alice')),
  '42501', null, 'utente: non scrive i pesi impliciti (li aggiorna solo il cron)'
);

select tests.authenticate_as('guest');
select lives_ok(
  format($$insert into public.user_constraints (user_id, trip_days, trip_months) values (%L, 3, '{}')$$, tests.uid('guest')),
  'ospite: salva le proprie risposte'
);
select lives_ok(
  format($$insert into public.preference_weights (user_id, interest_key, explicit) values (%L, 'villages', 4)$$, tests.uid('guest')),
  'ospite: salva i pesi'
);
select lives_ok(
  format($$update public.profiles set pace = 'intense' where id = %L$$, tests.uid('guest')),
  'ospite: salva il ritmo'
);

----------------------------------------------------------------------------
-- ALTRI: nessuno legge o cambia le risposte di alice
----------------------------------------------------------------------------
select tests.authenticate_as('bob');
select is_empty(format($$select 1 from public.user_constraints where user_id = %L$$, tests.uid('alice')), 'altro utente: non legge i vincoli di alice');
select is_empty(format($$select 1 from public.preference_weights where user_id = %L$$, tests.uid('alice')), 'altro utente: non legge i pesi di alice');
update public.user_constraints set trip_days = 14 where user_id = tests.uid('alice');
update public.profiles set pace = 'intense' where id = tests.uid('alice');
select throws_ok(
  format($$insert into public.preference_weights (user_id, interest_key, explicit) values (%L, 'art', 5)$$, tests.uid('alice')),
  '42501', null, 'altro utente: non scrive pesi per alice'
);
select tests.authenticate_as('guest');
select is_empty(format($$select 1 from public.user_constraints where user_id = %L$$, tests.uid('alice')), 'ospite: non legge i vincoli di alice');
select tests.authenticate_as('admin');
select is_empty(format($$select 1 from public.user_constraints where user_id = %L$$, tests.uid('alice')), 'admin: non legge i vincoli di alice');
select tests.as_anon();
select throws_ok($$select * from public.user_constraints$$, '42501', null, 'anonimo: niente vincoli');
select throws_ok($$select * from public.preference_weights$$, '42501', null, 'anonimo: niente pesi');
reset role;

select results_eq(
  format($$select c.trip_days, p.pace::text from public.user_constraints c join public.profiles p on p.id = c.user_id where c.user_id = %L$$, tests.uid('alice')),
  $$values (4::smallint, 'relaxed')$$,
  'altro utente: le risposte di alice non sono cambiate'
);

----------------------------------------------------------------------------
-- VINCOLI
----------------------------------------------------------------------------
select throws_ok(
  format($$update public.user_constraints set trip_days = 15 where user_id = %L$$, tests.uid('alice')),
  '23514', null, 'giorni tra 1 e 14'
);
select throws_ok(
  format($$update public.user_constraints set trip_months = '{13}' where user_id = %L$$, tests.uid('alice')),
  '23514', null, 'mesi tra 1 e 12'
);
select throws_ok(
  format($$update public.preference_weights set explicit = 6 where user_id = %L$$, tests.uid('alice')),
  '23514', null, 'pesi tra 0 e 5'
);

select * from finish();
rollback;
