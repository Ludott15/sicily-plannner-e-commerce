-- Chatbot (passo 9.1): sessioni, messaggi, proposte. Ruoli: anonimo, proprietario (alice),
-- altro utente (bob), admin, ospite (guest). Tutto annullato dal rollback finale.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('admin', true);
select tests.create_guest('guest');

insert into public.itineraries (id, owner_id, title, days)
values ('cccccccc-0000-0000-0000-000000000001', tests.uid('alice'), 'int- Viaggio di alice', 3);

-- Sessioni: il proprietario crea la propria, l'ospite la sua.
select tests.authenticate_as('alice');
select lives_ok(
  format($$insert into public.chat_sessions (id, user_id, itinerary_id, title) values ('cccccccc-0000-0000-0000-000000000010', %L, 'cccccccc-0000-0000-0000-000000000001', 'int- Sessione')$$, tests.uid('alice')),
  'proprietario: crea la sessione collegata al proprio viaggio'
);

-- Messaggi: solo tramite append_chat_message.
select throws_ok(
  $$insert into public.chat_messages (session_id, role, content) values ('cccccccc-0000-0000-0000-000000000010', 'user', '{"kind":"text","text":"x"}')$$,
  '42501', null, 'proprietario: insert diretto nei messaggi rifiutato'
);
select lives_ok(
  $$select public.append_chat_message('cccccccc-0000-0000-0000-000000000010', 'user', '{"kind":"text","text":"Cosa vedo a Noto?"}', null, null, null)$$,
  'proprietario: append_chat_message scrive un messaggio utente'
);
select isnt(
  public.append_chat_message('cccccccc-0000-0000-0000-000000000010', 'assistant', '{"kind":"text","text":"Ecco."}', '{"tools":[]}', 1200, 300),
  null,
  'proprietario: append_chat_message restituisce l id'
);
select throws_ok(
  $$select public.append_chat_message('cccccccc-0000-0000-0000-000000000010', 'system', '{"kind":"text","text":"x"}', null, null, null)$$,
  '23514', null, 'append_chat_message: ruolo non ammesso rifiutato dal vincolo'
);
select results_eq(
  $$select count(*)::int from public.chat_messages where session_id = 'cccccccc-0000-0000-0000-000000000010'$$,
  $$values (2)$$,
  'proprietario: legge i messaggi della propria sessione'
);
select results_eq(
  $$select public.chat_messages_today()$$,
  $$values (1)$$,
  'proprietario: chat_messages_today conta solo i messaggi utente di oggi'
);

-- Proposte: create e decise una sola volta.
select lives_ok(
  $$select public.create_chat_proposal('cccccccc-0000-0000-0000-000000000010', (select id from public.chat_messages where session_id = 'cccccccc-0000-0000-0000-000000000010' and role = 'assistant'), 'itinerary', '{"itineraryId":"cccccccc-0000-0000-0000-000000000001","changes":[],"asGroupProposal":false}')$$,
  'proprietario: crea una proposta sul proprio messaggio'
);
select throws_ok(
  $$select public.create_chat_proposal('cccccccc-0000-0000-0000-000000000010', (select id from public.chat_messages where session_id = 'cccccccc-0000-0000-0000-000000000010' and role = 'assistant'), 'tipo_sbagliato', '{}')$$,
  '23514', null, 'create_chat_proposal: tipo non ammesso rifiutato'
);
select lives_ok(
  $$select * from public.decide_chat_proposal((select id from public.chat_proposals where session_id = 'cccccccc-0000-0000-0000-000000000010'), 'accepted')$$,
  'proprietario: accetta la proposta una volta'
);
select throws_ok(
  $$select * from public.decide_chat_proposal((select id from public.chat_proposals where session_id = 'cccccccc-0000-0000-0000-000000000010'), 'rejected')$$,
  'P0001', 'chat_proposal_decided', 'proprietario: proposta decisa due volte rifiutata'
);
select throws_ok(
  $$select * from public.decide_chat_proposal(gen_random_uuid(), 'accepted')$$,
  'P0001', 'chat_proposal_not_found', 'proprietario: proposta inesistente'
);
select throws_ok(
  $$select * from public.decide_chat_proposal((select id from public.chat_proposals limit 1), 'maybe')$$,
  'P0001', 'invalid_chat_status', 'proprietario: stato di decisione non ammesso'
);

-- Il proprietario legge le proprie proposte, non le scrive.
select throws_ok(
  $$insert into public.chat_proposals (session_id, message_id, kind, payload) values ('cccccccc-0000-0000-0000-000000000010', (select id from public.chat_messages limit 1), 'itinerary', '{}')$$,
  '42501', null, 'proprietario: insert diretto nelle proposte rifiutato'
);
select results_eq(
  $$select status::text from public.chat_proposals where session_id = 'cccccccc-0000-0000-0000-000000000010'$$,
  $$values ('accepted'::text)$$,
  'proprietario: legge lo stato della proposta'
);

-- Limiti di dimensione e ruolo del messaggio collegato (alice è ancora autenticata).
select throws_ok(
  $q$select public.append_chat_message('cccccccc-0000-0000-0000-000000000010', 'user', jsonb_build_object('kind', 'text', 'text', repeat('a', 70000)), null, null, null)$q$,
  'P0001', 'chat_message_too_large', 'append_chat_message: contenuto oltre 64 KB rifiutato'
);
select throws_ok(
  $q$select public.append_chat_message('cccccccc-0000-0000-0000-000000000010', 'assistant', '{"kind":"text","text":"ok"}', jsonb_build_object('tools', repeat('a', 70000)), null, null)$q$,
  'P0001', 'chat_message_too_large', 'append_chat_message: strumenti oltre 64 KB rifiutati'
);
select throws_ok(
  $q$select public.create_chat_proposal('cccccccc-0000-0000-0000-000000000010', (select id from public.chat_messages where session_id = 'cccccccc-0000-0000-0000-000000000010' and role = 'assistant' limit 1), 'itinerary', jsonb_build_object('x', repeat('a', 17000)))$q$,
  'P0001', 'chat_proposal_too_large', 'create_chat_proposal: payload oltre 16 KB rifiutato'
);
select throws_ok(
  $q$select public.create_chat_proposal('cccccccc-0000-0000-0000-000000000010', (select id from public.chat_messages where session_id = 'cccccccc-0000-0000-0000-000000000010' and role = 'user' limit 1), 'itinerary', '{}')$q$,
  'P0001', 'chat_message_not_found', 'create_chat_proposal: messaggio dell''utente non ammesso come origine'
);

reset role;
select tests.authenticate_as('bob');
select throws_ok(
  $$select public.append_chat_message('cccccccc-0000-0000-0000-000000000010', 'user', '{"kind":"text","text":"intruso"}', null, null, null)$$,
  'P0001', 'chat_session_not_found', 'altro utente: non scrive nella sessione di alice'
);
select throws_ok(
  $$select public.create_chat_proposal('cccccccc-0000-0000-0000-000000000010', (select id from public.chat_messages limit 1), 'itinerary', '{}')$$,
  'P0001', 'chat_session_not_found', 'altro utente: non crea proposte nella sessione di alice'
);
select throws_ok(
  $$select * from public.decide_chat_proposal((select id from public.chat_proposals limit 1), 'accepted')$$,
  'P0001', 'chat_proposal_not_found', 'altro utente: non decide le proposte di alice'
);
select is_empty($$select 1 from public.chat_sessions$$, 'altro utente: non vede le sessioni di alice');
select is_empty($$select 1 from public.chat_proposals$$, 'altro utente: non vede le proposte di alice');
select is_empty($$select 1 from public.chat_messages$$, 'altro utente: non vede i messaggi di alice');

reset role;
select tests.authenticate_as('admin');
select is_empty($$select 1 from public.chat_proposals$$, 'admin: non legge le proposte dal client');

-- Ospite: può chattare nella propria sessione.
reset role;
select tests.authenticate_as('guest');
select lives_ok(
  format($$insert into public.chat_sessions (user_id, title) values (%L, 'int- Sessione ospite')$$, tests.uid('guest')),
  'ospite: crea la propria sessione'
);
select lives_ok(
  $$select public.append_chat_message((select id from public.chat_sessions where title = 'int- Sessione ospite'), 'user', '{"kind":"text","text":"ciao"}', null, null, null)$$,
  'ospite: scrive nella propria sessione'
);

reset role;
select tests.as_anon();
select throws_ok(
  $$select public.append_chat_message('cccccccc-0000-0000-0000-000000000010', 'user', '{}', null, null, null)$$,
  '42501', null, 'anonimo: append_chat_message senza grant'
);
select throws_ok(
  $$select public.chat_messages_today()$$,
  '42501', null, 'anonimo: chat_messages_today senza grant'
);
select throws_ok($$select * from public.chat_proposals$$, '42501', null, 'anonimo: non legge le proposte');

select * from finish();
rollback;
