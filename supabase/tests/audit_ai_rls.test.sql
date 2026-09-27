-- admin_audit_log (immutabile) e chat: chat_sessions, chat_messages.
-- Ruoli: anonimo, proprietario (alice), altro utente (bob), admin.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('admin', true);
select tests.create_user('admin2', true);

----------------------------------------------------------------------------
-- ADMIN_AUDIT_LOG
----------------------------------------------------------------------------
-- Il server registra le azioni admin (dbAdmin).
insert into public.admin_audit_log (actor_id, action, entity, entity_id, diff)
values
  (tests.uid('admin'), 'points.adjust', 'points_ledger', gen_random_uuid(), '{"delta": 100, "reason": "rimborso"}'),
  (tests.uid('admin2'), 'order.refund', 'orders', gen_random_uuid(), '{"status": ["paid", "refunded"]}');

select tests.authenticate_as('admin');
select results_eq(
  $$select action from public.admin_audit_log order by id$$,
  $$values ('points.adjust'), ('order.refund')$$,
  'admin: legge il registro'
);
select throws_ok(
  $$insert into public.admin_audit_log (action, entity) values ('fake', 'x')$$,
  '42501', null, 'admin: non scrive nel registro dal client'
);
select throws_ok($$update public.admin_audit_log set action = 'x'$$, '42501', null, 'admin: update del registro rifiutato');
select throws_ok($$delete from public.admin_audit_log$$, '42501', null, 'admin: delete del registro rifiutato');

reset role;
select tests.authenticate_as('alice');
select is_empty($$select 1 from public.admin_audit_log$$, 'utente: non legge il registro');
reset role;
select tests.as_anon();
select throws_ok($$select * from public.admin_audit_log$$, '42501', null, 'anon: non legge il registro');

-- Ruolo postgres (dbAdmin): il trigger rifiuta tutto.
reset role;
select throws_ok(
  $$update public.admin_audit_log set action = 'x'$$,
  'P0001', 'admin_audit_log_immutable', 'postgres: update del registro rifiutato dal trigger'
);
select throws_ok(
  $$delete from public.admin_audit_log$$,
  'P0001', 'admin_audit_log_immutable', 'postgres: delete del registro rifiutato dal trigger'
);
select throws_ok(
  $$truncate public.admin_audit_log$$,
  'P0001', 'admin_audit_log_immutable', 'postgres: truncate del registro rifiutato'
);
select throws_ok(
  format($$update public.admin_audit_log set actor_id = null where actor_id = %L$$, tests.uid('admin')),
  'P0001', 'admin_audit_log_immutable', 'postgres: nemmeno actor_id si azzera a mano'
);

-- Eliminazione dell'account dell'admin: la riga resta, actor_id diventa null.
select lives_ok(
  format($$delete from auth.users where id = %L$$, tests.uid('admin2')),
  'eliminazione account admin: riuscita'
);
select results_eq(
  $$select actor_id, action, diff from public.admin_audit_log where action = 'order.refund'$$,
  $$values (null::uuid, 'order.refund', '{"status": ["paid", "refunded"]}'::jsonb)$$,
  'eliminazione account admin: la riga resta intatta con actor_id null'
);

----------------------------------------------------------------------------
-- CHAT
----------------------------------------------------------------------------
insert into public.itineraries (id, owner_id, title, days)
values
  ('dddddddd-0000-0000-0000-000000000001', tests.uid('alice'), 'Di alice', 3),
  ('dddddddd-0000-0000-0000-000000000002', tests.uid('bob'), 'Di bob', 3);

select tests.authenticate_as('alice');
select lives_ok(
  format($$insert into public.chat_sessions (id, user_id, itinerary_id, title) values ('eeeeeeee-0000-0000-0000-000000000001', %L, 'dddddddd-0000-0000-0000-000000000001', 'Viaggio a Noto')$$, tests.uid('alice')),
  'proprietario: crea una sessione collegata al proprio itinerario'
);
select throws_ok(
  format($$insert into public.chat_sessions (user_id, itinerary_id) values (%L, 'dddddddd-0000-0000-0000-000000000002')$$, tests.uid('alice')),
  '42501', null, 'proprietario: non collega la sessione all''itinerario di un altro'
);
select throws_ok(
  format($$insert into public.chat_sessions (user_id) values (%L)$$, tests.uid('bob')),
  '42501', null, 'proprietario: non crea sessioni a nome di altri'
);
select lives_ok(
  $$update public.chat_sessions set title = 'Barocco a Noto' where id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  'proprietario: rinomina la sessione'
);
select throws_ok(
  $$insert into public.chat_messages (session_id, role, content) values ('eeeeeeee-0000-0000-0000-000000000001', 'assistant', '"finto"')$$,
  '42501', null, 'proprietario: non scrive messaggi (li scrive solo il server)'
);

reset role;
insert into public.chat_messages (session_id, role, content, input_tokens, output_tokens)
values
  ('eeeeeeee-0000-0000-0000-000000000001', 'user', '"Cosa vedo a Noto?"', null, null),
  ('eeeeeeee-0000-0000-0000-000000000001', 'assistant', '"[[activity:x]]"', 1200, 300);
select throws_ok(
  $$insert into public.chat_messages (session_id, role, content) values ('eeeeeeee-0000-0000-0000-000000000001', 'system', '"x"')$$,
  '23514', null, 'chat_messages: ruolo tra user, assistant, tool'
);

select tests.authenticate_as('alice');
select results_eq($$select count(*)::int from public.chat_messages$$, $$values (2)$$, 'proprietario: legge i messaggi della propria sessione');
select throws_ok($$update public.chat_messages set content = '"x"'$$, '42501', null, 'proprietario: non modifica i messaggi');

reset role;
select tests.authenticate_as('bob');
select is_empty($$select 1 from public.chat_sessions$$, 'altro utente: non vede le sessioni di alice');
select is_empty($$select 1 from public.chat_messages$$, 'altro utente: non vede i messaggi di alice');
update public.chat_sessions set title = 'hack';
delete from public.chat_sessions;
reset role;
select is(
  (select title from public.chat_sessions where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'Barocco a Noto',
  'altro utente: update e delete della sessione di alice senza effetto'
);

select tests.authenticate_as('admin');
select is_empty($$select 1 from public.chat_sessions$$, 'admin: non legge le sessioni dal client');
select is_empty($$select 1 from public.chat_messages$$, 'admin: non legge i messaggi dal client');

reset role;
select tests.as_anon();
select throws_ok($$select * from public.chat_sessions$$, '42501', null, 'anon: non legge le sessioni');
select throws_ok($$select * from public.chat_messages$$, '42501', null, 'anon: non legge i messaggi');

reset role;
select tests.authenticate_as('alice');
select lives_ok(
  $$delete from public.chat_sessions where id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  'proprietario: elimina la sessione'
);
reset role;
select is_empty(
  $$select 1 from public.chat_messages where session_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  'proprietario: i messaggi si eliminano con la sessione'
);

select * from finish();
rollback;
