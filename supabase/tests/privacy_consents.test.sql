-- Passo 8.2: registro dei consensi, profilazione condizionata al consenso, revoca, nome pubblico di
-- default da Google. Ruoli: utente, altro utente, admin, ospite, anonimo.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('user');
select tests.create_user('other');
select tests.create_user('admin', true);
select tests.create_guest('guest');

----------------------------------------------------------------------------
-- REGISTRO: scrittura solo con record_consent, validazione, ospiti
----------------------------------------------------------------------------
select tests.authenticate_as('user');
select is((select (public.record_consent('profiling', true, 'profiling-test-v1')).granted), true,
  'utente: record_consent restituisce la riga con granted = true');
select is(public.current_consent('profiling'), true, 'utente: stato attuale della profilazione = concessa');
select is((select (public.record_consent('profiling', false, 'profiling-test-v1')).granted), false,
  'utente: la scelta successiva vince (nuova riga)');
select is(public.current_consent('profiling'), false, 'utente: stato attuale = revocata');
select is((select count(*)::int from public.user_consents), 2, 'utente: vede le sue due righe (storico)');
select throws_ok($$select public.record_consent('marketing', true, 'v1')$$, 'P0001', 'invalid_consent_kind',
  'tipo di consenso sconosciuto respinto');
select throws_ok($$select public.record_consent('profiling', true, '')$$, 'P0001', 'invalid_consent_version',
  'versione del testo vuota respinta');
select throws_ok($$insert into public.user_consents (user_id, kind, granted, text_version)
  values (auth.uid(), 'profiling', true, 'diretto')$$, '42501', null,
  'utente: nessuna scrittura diretta sul registro');
select throws_ok($$update public.user_consents set granted = true$$, '42501', null,
  'utente: nessun aggiornamento del registro');
reset role;

select throws_ok($$update public.user_consents set granted = true$$, 'P0001', 'user_consents_immutable',
  'registro immutabile anche per postgres');
select throws_ok($$delete from public.user_consents$$, 'P0001', 'user_consents_immutable',
  'registro: nessuna cancellazione diretta');

select tests.authenticate_as('other');
select is((select count(*)::int from public.user_consents where user_id = tests.uid('user')), 0,
  'altro utente: non vede le righe altrui');
reset role;

select tests.as_anon();
select throws_ok($$select count(*) from public.user_consents$$, '42501', null, 'anonimo: nessun accesso al registro');
select throws_ok($$select public.record_consent('profiling', true, 'v1')$$, '42501', null,
  'anonimo: nessuna scrittura del consenso');
reset role;

select tests.authenticate_as('admin');
select is((select count(*)::int from public.user_consents), 0, 'admin: non vede i consensi degli utenti');
reset role;

select tests.authenticate_as('guest');
select lives_ok($$select public.record_consent('profiling', true, 'profiling-test-v1')$$,
  'ospite: il consenso alla profilazione è ammesso');
select lives_ok($$select public.record_consent('sensitive', true, 'sensitive-test-v1')$$,
  'ospite: il consenso ai dati sensibili è ammesso');
select throws_ok($$select public.record_consent('newsletter', true, 'news-test-v1')$$, 'P0001', 'guest_not_allowed',
  'ospite: la newsletter non è ammessa');
reset role;

----------------------------------------------------------------------------
-- PROFILAZIONE: user_events si scrive solo con consenso (il trigger scarta in silenzio)
----------------------------------------------------------------------------
select tests.authenticate_as('other');
select is(public.current_consent('profiling'), null, 'altro utente: consenso mai chiesto = null');
reset role;

insert into public.user_events (user_id, type) values (tests.uid('other'), 'flight_search');
select is((select count(*)::int from public.user_events where user_id = tests.uid('other')), 0,
  'senza consenso alla profilazione: nessun evento scritto');
select is(public.profiling_allowed(tests.uid('other')), false, 'profilazione spenta senza consenso');

insert into public.user_consents (user_id, kind, granted, text_version)
  values (tests.uid('user'), 'profiling', true, 'profiling-test-v1');
insert into public.user_events (user_id, type) values (tests.uid('user'), 'flight_search');
select is((select count(*)::int from public.user_events where user_id = tests.uid('user')), 1,
  'con consenso alla profilazione: l''evento si scrive');

----------------------------------------------------------------------------
-- REVOCA: cancella eventi, pesi impliciti e profilo; le preferenze esplicite restano
----------------------------------------------------------------------------
insert into public.user_taste (user_id) values (tests.uid('user'));
insert into public.preference_weights (user_id, interest_key, explicit, implicit)
  select tests.uid('user'), i.key, 3, 1.5 from public.interests i limit 1;

select tests.authenticate_as('user');
select is((select (public.record_consent('profiling', false, 'profiling-test-v1')).granted), false,
  'utente: revoca della profilazione');
reset role;

select is((select count(*)::int from public.user_events where user_id = tests.uid('user')), 0,
  'revoca: eventi cancellati');
select is((select count(*)::int from public.user_taste where user_id = tests.uid('user')), 0,
  'revoca: profilo (embedding) cancellato');
select is((select count(*)::int from public.preference_weights
  where user_id = tests.uid('user') and implicit <> 0), 0, 'revoca: pesi impliciti a zero');
select is((select count(*)::int from public.preference_weights
  where user_id = tests.uid('user') and explicit = 3), least(1, (select count(*)::int from public.interests)),
  'revoca: le preferenze esplicite restano');

insert into public.user_events (user_id, type) values (tests.uid('user'), 'flight_search');
select is((select count(*)::int from public.user_events where user_id = tests.uid('user')), 0,
  'dopo la revoca nessun nuovo evento');

----------------------------------------------------------------------------
-- NOME PUBBLICO DI DEFAULT (handle_new_user)
----------------------------------------------------------------------------
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('c0820000-0000-0000-0000-000000000001', 'maria-82@test.local', '{"provider":"google"}',
   '{"full_name":"Maria Rossi","avatar_url":"https://example.com/a.png"}'),
  ('c0820000-0000-0000-0000-000000000002', 'anna-82@test.local', '{"provider":"email"}',
   '{"full_name":"Anna Verdi"}');
select is((select display_name from public.profiles where id = 'c0820000-0000-0000-0000-000000000001'), 'Maria',
  'Google: il nome pubblico di default è solo il nome');
select is((select display_name from public.profiles where id = 'c0820000-0000-0000-0000-000000000002'), 'Anna Verdi',
  'altri accessi: il nome resta com''è');

select * from finish();
rollback;
