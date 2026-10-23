-- Apprendimento (M11): learn_from_events e learn_event_delta sono solo per il cron (ruolo postgres).
-- Il conteggio dei propri eventi (my_event_count) conta solo le righe di chi lo chiama; user_events
-- non è leggibile dai ruoli applicativi. Ruoli: anonimo, utente, altro utente.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
insert into public.user_consents (user_id, kind, granted, text_version) values (tests.uid('alice'), 'profiling', true, 'profiling-test-v1');
insert into public.user_consents (user_id, kind, granted, text_version) values (tests.uid('bob'), 'profiling', true, 'profiling-test-v1');

insert into public.user_events (user_id, type)
values (tests.uid('alice'), 'view'), (tests.uid('alice'), 'view');

----------------------------------------------------------------------------
-- ESECUZIONE: solo il cron (postgres) chiama le funzioni di apprendimento
----------------------------------------------------------------------------
select tests.as_anon();
select throws_ok(
  $$select * from public.learn_from_events('{"decay":0.05}'::jsonb, 10)$$,
  '42501', null, 'anonimo: non esegue learn_from_events'
);
select throws_ok(
  $$select public.learn_event_delta('{"decay":0.05}'::jsonb, 'save', null::uuid, null::uuid)$$,
  '42501', null, 'anonimo: non esegue learn_event_delta'
);
select throws_ok(
  $$select public.my_event_count()$$,
  '42501', null, 'anonimo: non esegue my_event_count'
);

select tests.authenticate_as('alice');
select throws_ok(
  $$select * from public.learn_from_events('{"decay":0.05}'::jsonb, 10)$$,
  '42501', null, 'utente: non esegue learn_from_events'
);
select throws_ok(
  $$select public.learn_event_delta('{"decay":0.05}'::jsonb, 'save', null::uuid, null::uuid)$$,
  '42501', null, 'utente: non esegue learn_event_delta'
);

----------------------------------------------------------------------------
-- LETTURA: la tabella non è leggibile; il conteggio conta solo i propri eventi
----------------------------------------------------------------------------
select throws_ok(
  $$select * from public.user_events$$,
  '42501', null, 'utente: non legge la tabella user_events'
);
select results_eq(
  $$select public.my_event_count()$$,
  $$values (2)$$,
  'utente: conta i propri eventi'
);
select tests.authenticate_as('bob');
select results_eq(
  $$select public.my_event_count()$$,
  $$values (0)$$,
  'altro utente: il conteggio non include gli eventi di altri'
);
select throws_ok(
  $$update public.user_events set processed_at = now()$$,
  '42501', null, 'altro utente: non segna eventi come processati'
);

select * from finish();
rollback;
