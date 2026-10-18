-- Passo 8.2: conservazione (apply_retention). Cancella o scollega solo le righe oltre soglia;
-- le altre restano. Il database locale può avere altre righe vecchie: i controlli riguardano le
-- righe di questo test. Soglie come in src/server/privacy/retention.ts (RETENTION).
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('ret');
select tests.create_user('admin', true);

-- Il consenso alla profilazione serve a scrivere user_events (il trigger scarta gli altri).
insert into public.user_consents (user_id, kind, granted, text_version)
  values (tests.uid('ret'), 'profiling', true, 'profiling-test-v1');

-- Chat: vecchia senza messaggi (via), vecchia ma con un messaggio recente (resta), senza messaggi
-- ma creata da poco (resta), vecchia con l'ultimo messaggio di 13 mesi fa (via).
insert into public.chat_sessions (id, user_id, title, created_at) values
  ('c5820000-0000-0000-0000-000000000001', tests.uid('ret'), 'ret-chat-vecchia-vuota', now() - interval '13 months'),
  ('c5820000-0000-0000-0000-000000000002', tests.uid('ret'), 'ret-chat-recente-msg', now() - interval '13 months'),
  ('c5820000-0000-0000-0000-000000000003', tests.uid('ret'), 'ret-chat-nuova', now()),
  ('c5820000-0000-0000-0000-000000000004', tests.uid('ret'), 'ret-chat-msg-vecchio', now() - interval '14 months');
insert into public.chat_messages (session_id, role, content, created_at) values
  ('c5820000-0000-0000-0000-000000000002', 'user', '"ciao"', now() - interval '2 days'),
  ('c5820000-0000-0000-0000-000000000004', 'user', '"vecchio"', now() - interval '13 months');

-- Eventi: 19 mesi (via), 17 mesi (resta).
insert into public.user_events (user_id, type, created_at) values
  (tests.uid('ret'), 'flight_search', now() - interval '19 months'),
  (tests.uid('ret'), 'flight_search', now() - interval '17 months');

-- Click: 27 mesi con utente e anon_id (restano le statistiche, si tolgono utente e anon_id),
-- 25 mesi con utente (resta tutto).
insert into public.affiliate_clicks (user_id, anon_id, partner, target_url, subid, context, created_at) values
  (tests.uid('ret'), '11111111-1111-4111-8111-111111111111', 'viator', 'https://www.viator.com/r1', 'ret82clickold01', 'page', now() - interval '27 months'),
  (tests.uid('ret'), null, 'viator', 'https://www.viator.com/r2', 'ret82clicknew01', 'page', now() - interval '25 months');

-- Inviti: scaduto da 40 giorni (via), scaduto da 10 giorni (resta). Creati prima della scadenza.
insert into public.groups (id, name, owner_id) values
  ('c5820000-0000-0000-0000-000000000011', 'Gruppo retention 82', tests.uid('ret'));
insert into public.group_invites (group_id, token_hash, invited_by, created_at, expires_at) values
  ('c5820000-0000-0000-0000-000000000011', repeat('a', 64), tests.uid('ret'), now() - interval '45 days', now() - interval '40 days'),
  ('c5820000-0000-0000-0000-000000000011', repeat('b', 64), tests.uid('ret'), now() - interval '17 days', now() - interval '10 days');

-- Ricerche senza risultato: non viste da 13 mesi (via), vista ieri (resta).
insert into public.search_misses (query_norm, misses, first_seen, last_seen) values
  ('ret82 vecchia', 1, now() - interval '13 months', now() - interval '13 months'),
  ('ret82 recente', 1, now() - interval '1 day', now() - interval '1 day');

-- Ordini: 11 anni fa con email e spedizione (anonimizzato), 9 anni fa (resta com'è).
insert into public.orders (id, user_id, email, subtotal_cents, total_cents, stripe_session_id, shipping_address, created_at) values
  ('c5820000-0000-0000-0000-000000000031', tests.uid('ret'), 'ret82-old@test.local', 1000, 1000, 'cs_ret82_old', '{"via":"Via vecchia 1"}', now() - interval '11 years'),
  ('c5820000-0000-0000-0000-000000000032', tests.uid('ret'), 'ret82-new@test.local', 1000, 1000, 'cs_ret82_new', '{"via":"Via nuova 2"}', now() - interval '9 years');

-- Notifiche: lette da 7 mesi (via), lette da 5 mesi (resta), non lette (restano).
insert into public.notifications (id, user_id, kind, read_at, created_at) values
  ('c5820000-0000-0000-0000-000000000021', tests.uid('ret'), 'badge_earned', now() - interval '7 months', now() - interval '8 months'),
  ('c5820000-0000-0000-0000-000000000022', tests.uid('ret'), 'badge_earned', now() - interval '5 months', now() - interval '6 months'),
  ('c5820000-0000-0000-0000-000000000023', tests.uid('ret'), 'badge_earned', null, now() - interval '9 months');

----------------------------------------------------------------------------
-- CONFIGURAZIONE NON VALIDA E ACCESSO
----------------------------------------------------------------------------
select throws_ok($$select * from public.apply_retention('{"chatSessionMonths": 12}'::jsonb)$$, 'P0001',
  'retention_config_invalid', 'configurazione incompleta respinta');
select tests.authenticate_as('ret');
select throws_ok($$select * from public.apply_retention('{"chatSessionMonths": 12, "userEventMonths": 18, "affiliateClickMonths": 26, "groupInviteDays": 30, "searchMissMonths": 12, "notificationReadMonths": 6, "orderDataYears": 10}'::jsonb)$$,
  '42501', null, 'utente: la conservazione non è eseguibile dai ruoli applicativi');
reset role;

----------------------------------------------------------------------------
-- ESECUZIONE (come il cron, ruolo postgres)
----------------------------------------------------------------------------
select is(
  (select count(*)::int from public.apply_retention(
    '{"chatSessionMonths": 12, "userEventMonths": 18, "affiliateClickMonths": 26, "groupInviteDays": 30, "searchMissMonths": 12, "notificationReadMonths": 6, "orderDataYears": 10}'::jsonb)
    where job_name in ('chat_sessions', 'user_events', 'affiliate_clicks', 'group_invites', 'search_misses', 'notifications', 'orders_personal_data')),
  7, 'il cron riceve una riga di esito per ciascun lavoro');

select is((select count(*)::int from public.chat_sessions where title like 'ret-chat-%'), 2,
  'chat: restano la recente con messaggio e la nuova');
select is((select count(*)::int from public.chat_sessions where title in ('ret-chat-vecchia-vuota', 'ret-chat-msg-vecchio')), 0,
  'chat: via quelle senza messaggi da 12 mesi');
select is((select count(*)::int from public.user_events where user_id = tests.uid('ret')), 1,
  'eventi: via quello oltre 18 mesi, resta quello a 17');
select is((select user_id from public.affiliate_clicks where subid = 'ret82clickold01'), null,
  'click vecchio: utente tolto');
select is((select anon_id from public.affiliate_clicks where subid = 'ret82clickold01'), null,
  'click vecchio: anon_id tolto');
select is((select count(*)::int from public.affiliate_clicks where subid = 'ret82clickold01'), 1,
  'click vecchio: la statistica resta');
select is((select user_id from public.affiliate_clicks where subid = 'ret82clicknew01'), tests.uid('ret'),
  'click a 25 mesi: utente conservato');
select is((select count(*)::int from public.group_invites where group_id = 'c5820000-0000-0000-0000-000000000011'), 1,
  'inviti: via quello scaduto da 40 giorni, resta quello scaduto da 10');
select is((select count(*)::int from public.search_misses where query_norm = 'ret82 vecchia'), 0,
  'ricerche: via quella non vista da 13 mesi');
select is((select count(*)::int from public.search_misses where query_norm = 'ret82 recente'), 1,
  'ricerche: resta quella di ieri');
select is((select email from public.orders where id = 'c5820000-0000-0000-0000-000000000031'), 'anonimizzato@invalid.local',
  'ordini: oltre 10 anni, email anonimizzata');
select is((select shipping_address from public.orders where id = 'c5820000-0000-0000-0000-000000000031'), null,
  'ordini: oltre 10 anni, indirizzo di spedizione rimosso');
select is((select total_cents from public.orders where id = 'c5820000-0000-0000-0000-000000000031'), 1000,
  'ordini: importi e date restano per l''obbligo contabile');
select is((select email from public.orders where id = 'c5820000-0000-0000-0000-000000000032'), 'ret82-new@test.local',
  'ordini: sotto 10 anni, dati intatti');
select is((select count(*)::int from public.notifications where id = 'c5820000-0000-0000-0000-000000000021'), 0,
  'notifiche: via quella letta da 7 mesi');
select is((select count(*)::int from public.notifications where id in ('c5820000-0000-0000-0000-000000000022', 'c5820000-0000-0000-0000-000000000023')), 2,
  'notifiche: restano quella letta da 5 mesi e quella non letta');

select * from finish();
rollback;
