-- Passo 8.2: eliminazione dell'account (delete_my_account). Cosa sparisce, cosa resta: gruppi con
-- passaggio di proprietà, gruppo vuoto, recensioni senza autore, ordini e registro admin con user null,
-- ledger dei punti per cascade, ospiti, anonimo.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('owner');
select tests.create_user('member');
select tests.create_user('other');
select tests.create_user('admin', true);
select tests.create_guest('guest');

-- Fixture: un'attività con una recensione del proprietario, un viaggio di gruppo, un viaggio solo,
-- dati personali in ogni tabella con user_id.
insert into public.places (id, slug, name, province, lat, lng)
  values ('de820000-0000-0000-0000-000000000001', 'test-82-del-p1', 'Luogo 82', 'CT', 37.79, 14.83);
insert into public.activities (id, slug, place_id, title, duration_min, is_active) values
  ('de820000-0000-0000-0000-000000000011', 'test-82-del-a1', 'de820000-0000-0000-0000-000000000001', 'Attività 82', 60, true);
insert into public.reviews (user_id, activity_id, rating, body) values
  (tests.uid('owner'), 'de820000-0000-0000-0000-000000000011', 5, 'Bella davvero');

insert into public.itineraries (id, owner_id, title, days) values
  ('de820000-0000-0000-0000-000000000101', tests.uid('owner'), 'Viaggio di gruppo 82', 2),
  ('de820000-0000-0000-0000-000000000102', tests.uid('owner'), 'Viaggio solo 82', 1);
insert into public.itinerary_items (id, itinerary_id, day_index, position, custom_title) values
  ('de820000-0000-0000-0000-000000000201', 'de820000-0000-0000-0000-000000000101', 0, 0, 'Tappa 82');

select tests.authenticate_as('owner');
select set_config('tests.gid_group', public.create_group('Gruppo 82', 'de820000-0000-0000-0000-000000000101')::text, true);
select set_config('tests.gid_solo', public.create_group('Solo 82', 'de820000-0000-0000-0000-000000000102')::text, true);
reset role;

-- Il membro più vecchio (joined_at) diventa proprietario; "other" è entrato dopo.
insert into public.group_members (group_id, user_id, role, joined_at) values
  (current_setting('tests.gid_group')::uuid, tests.uid('member'), 'member', '2020-01-01 00:00+00'),
  (current_setting('tests.gid_group')::uuid, tests.uid('other'), 'member', '2021-01-01 00:00+00');

insert into public.user_consents (user_id, kind, granted, text_version)
  values (tests.uid('owner'), 'profiling', true, 'profiling-test-v1');
insert into public.user_events (user_id, type) values (tests.uid('owner'), 'flight_search');
insert into public.chat_sessions (user_id, title) values (tests.uid('owner'), 'Chat 82 proprietario');
insert into public.chat_sessions (user_id, title) values (tests.uid('other'), 'Chat 82 altro utente');
insert into public.notifications (user_id, kind) values (tests.uid('owner'), 'badge_earned');
insert into public.points_ledger (user_id, delta, reason, ref_type, ref_id, season) values
  (tests.uid('owner'), 5, 'review', 'activity', 'de820000-0000-0000-0000-000000000011', '2026-estate');
insert into public.user_taste (user_id) values (tests.uid('owner'));
insert into public.user_constraints (user_id, reduced_mobility, diet, sensitive_consent_at)
  values (tests.uid('owner'), true, '{vegan}', now());
insert into public.affiliate_clicks (user_id, anon_id, partner, target_url, subid, context)
  values (tests.uid('owner'), '11111111-1111-4111-8111-111111111111', 'viator', 'https://www.viator.com/82', 'test82subid0001', 'page');
-- Consigli locali firmati dal proprietario (persona con consenso) e uno della redazione.
insert into public.local_tip_authors (id, kind, display_name, bio, photo_url, profile_id, consent_at, is_active) values
  ('de820000-0000-0000-0000-000000000301', 'person', 'Nome Autore 82', 'Bio 82', 'https://example.com/82.png', tests.uid('owner'), now(), true),
  ('de820000-0000-0000-0000-000000000302', 'editorial', 'Redazione 82', null, null, null, null, true);
insert into public.local_tips (author_id, activity_id, body, author_relation, verified_at) values
  ('de820000-0000-0000-0000-000000000301', 'de820000-0000-0000-0000-000000000011', 'Consiglio 82 del proprietario', 'Residente', current_date),
  ('de820000-0000-0000-0000-000000000302', 'de820000-0000-0000-0000-000000000011', 'Consiglio 82 della redazione', null, current_date);
insert into public.orders (user_id, email, subtotal_cents, total_cents, stripe_session_id)
  values (tests.uid('owner'), 'owner-82@test.local', 1000, 1000, 'cs_test_82_owner');
insert into public.admin_audit_log (actor_id, action, entity) values
  (tests.uid('owner'), 'test82_points_adjust', 'points');
insert into public.item_votes (itinerary_item_id, itinerary_id, user_id, value) values
  ('de820000-0000-0000-0000-000000000201', 'de820000-0000-0000-0000-000000000101', tests.uid('owner'), 1);

-- Prenotazione aggiornata dal proprietario: updated_by è il proprietario. Il trigger di stampa
-- non deve riscriverlo durante la cancellazione, altrimenti la foreign key non lo azzera.
select tests.authenticate_as('owner');
insert into public.itinerary_bookings (itinerary_id, kind, activity_id, status)
  values ('de820000-0000-0000-0000-000000000101', 'activity', 'de820000-0000-0000-0000-000000000011', 'booked');
reset role;

----------------------------------------------------------------------------
-- ACCESSO: solo utenti autenticati, mai anonimo
----------------------------------------------------------------------------
select tests.as_anon();
select throws_ok($$select public.delete_my_account()$$, '42501', null, 'anonimo: nessuna cancellazione');
reset role;

----------------------------------------------------------------------------
-- CANCELLAZIONE DEL PROPRIETARIO
----------------------------------------------------------------------------
select tests.authenticate_as('owner');
select lives_ok($$select public.delete_my_account()$$, 'proprietario: cancellazione dell''account');
reset role;

select is((select count(*)::int from auth.users where id = tests.uid('owner')), 0, 'auth.users: utente eliminato');
select is((select count(*)::int from public.profiles where id = tests.uid('owner')), 0, 'profilo eliminato');

select is((select owner_id from public.groups where id = current_setting('tests.gid_group')::uuid),
  tests.uid('member'), 'gruppo con altri membri: passa al membro più vecchio');
select is((select role::text from public.group_members
  where group_id = current_setting('tests.gid_group')::uuid and user_id = tests.uid('member')), 'owner',
  'il nuovo proprietario è marcato owner');
select is((select owner_id from public.itineraries where id = 'de820000-0000-0000-0000-000000000101'),
  tests.uid('member'), 'viaggio di gruppo: passa con il gruppo');
select is((select count(*)::int from public.groups where id = current_setting('tests.gid_solo')::uuid), 0,
  'gruppo vuoto: eliminato');
select is((select count(*)::int from public.itineraries where id = 'de820000-0000-0000-0000-000000000102'), 0,
  'viaggio solo: eliminato');
select is((select count(*)::int from public.group_members where group_id = current_setting('tests.gid_group')::uuid), 2,
  'gli altri membri restano nel gruppo');

-- Consigli locali: l'autore diventa anonimo e disattivato, i suoi consigli non compaiono più nelle
-- pagine (vista pubblica, con il ruolo anonimo), il consiglio della redazione resta.
select is((select display_name from public.local_tip_authors where id = 'de820000-0000-0000-0000-000000000301'), 'Autore eliminato',
  'consigli: autore firmato come "Autore eliminato"');
select is((select row(is_active, profile_id, bio, photo_url, consent_at, kind::text) from public.local_tip_authors
  where id = 'de820000-0000-0000-0000-000000000301'),
  row(false, null::uuid, null::text, null::text, null::timestamptz, 'editorial'::text),
  'consigli: autore disattivato, senza profilo, bio, foto e consenso');
select tests.as_anon();
select is((select count(*)::int from public.public_local_tips where body like 'Consiglio 82 %'), 1,
  'consigli: come anonimo resta solo il consiglio della redazione');
select is((select count(*)::int from public.public_local_tips where body = 'Consiglio 82 del proprietario'), 0,
  'consigli: il consiglio dell''autore eliminato non compare più');
reset role;
select is((select count(*)::int from public.local_tips where body = 'Consiglio 82 del proprietario'), 1,
  'consigli: il testo resta in archivio, nascosto dalla vista');

select is((select count(*)::int from public.reviews where body = 'Bella davvero' and user_id is null), 1,
  'recensione: il testo resta, senza autore');
select is((select author_deleted from public.public_reviews where body = 'Bella davvero'), true,
  'vista pubblica: la recensione risulta di un utente eliminato');
select is((select count(*)::int from public.chat_sessions where title = 'Chat 82 proprietario'), 0, 'chat: eliminate');
select is((select count(*)::int from public.chat_sessions where title = 'Chat 82 altro utente'), 1,
  'chat di un altro utente: intatta');
select is((select count(*)::int from public.user_events where user_id = tests.uid('owner')), 0, 'eventi: eliminati');
select is((select count(*)::int from public.user_consents where user_id = tests.uid('owner')), 0, 'consensi: eliminati');
select is((select count(*)::int from public.notifications where user_id = tests.uid('owner')), 0, 'notifiche: eliminate');
select is((select count(*)::int from public.points_ledger where user_id = tests.uid('owner')), 0,
  'ledger dei punti: eliminato per cascade (prevent_mutation lo ammette)');
select is((select count(*)::int from public.user_taste where user_id = tests.uid('owner')), 0, 'profilo: eliminato');
select is((select count(*)::int from public.user_constraints where user_id = tests.uid('owner')), 0,
  'preferenze e dati sensibili: eliminati');
select is((select count(*)::int from public.item_votes where user_id = tests.uid('owner')), 0, 'voti: eliminati');
select is((select count(*)::int from public.itinerary_bookings where itinerary_id = 'de820000-0000-0000-0000-000000000101' and updated_by is null), 1,
  'prenotazioni: updated_by azzerato, la prenotazione resta');
select is((select count(*)::int from public.affiliate_clicks where subid = 'test82subid0001' and user_id is null and anon_id is null), 1,
  'click affiliati: via anche l''identificativo anonimo del browser');
select is((select count(*)::int from public.affiliate_clicks where subid = 'test82subid0001' and user_id is null), 1,
  'click affiliati: restano le statistiche, senza utente');
select is((select count(*)::int from public.orders where stripe_session_id = 'cs_test_82_owner' and user_id is null), 1,
  'ordini: restano (obbligo fiscale), con user null');
select is((select count(*)::int from public.admin_audit_log where action = 'test82_points_adjust' and actor_id is null), 1,
  'registro admin: la riga resta, con actor null');
select throws_ok($$update public.admin_audit_log set diff = '{}'::jsonb where action = 'test82_points_adjust'$$,
  'P0001', 'admin_audit_log_immutable', 'registro admin: resta immutabile dopo l''eliminazione');

----------------------------------------------------------------------------
-- OSPITE: eliminazione dei dati senza codice
----------------------------------------------------------------------------
select tests.authenticate_as('guest');
select lives_ok($$select public.delete_my_account()$$, 'ospite: eliminazione dei propri dati');
reset role;
select is((select count(*)::int from auth.users where id = tests.uid('guest')), 0, 'ospite: utente eliminato');
select is((select count(*)::int from auth.users where id = tests.uid('other')), 1, 'altro utente: non toccato');

select * from finish();
rollback;
