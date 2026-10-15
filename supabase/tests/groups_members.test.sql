-- Gruppi, passo 4.1: accept_invite (gruppo pieno, invited_by), invite_status, invite_preview_stops,
-- leave_group, remove_group_member, ospiti, anonimo, altri utenti, admin.
-- Dati creati nella transazione del test: nessuna dipendenza dal seed o dal database locale.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('owner');
select tests.create_user('member');
select tests.create_user('joiner');
select tests.create_user('other');
select tests.create_user('admin', true);
select tests.create_guest('guest');

create function tests.token_hash(p_token text) returns text language sql immutable
as $$ select encode(sha256(convert_to(p_token, 'UTF8')), 'hex') $$;

create function tests.gid() returns uuid language sql stable
as $$ select current_setting('tests.gid')::uuid $$;

-- Viaggio del proprietario con tappe: giorno 0 (Alfa, Beta), giorno 1 (Beta, Gamma), giorno 2
-- (Delta, Epsilon, Zeta, Eta). Il nome "Beta" compare due volte: nell'anteprima conta una volta.
insert into public.itineraries (id, owner_id, title, days)
values ('dddddddd-0000-0000-0000-000000000101', tests.uid('owner'), 'Ragusa e dintorni', 3);
insert into public.itinerary_items (itinerary_id, day_index, position, custom_title) values
  ('dddddddd-0000-0000-0000-000000000101', 0, 0, 'Alfa'),
  ('dddddddd-0000-0000-0000-000000000101', 0, 1, 'Beta'),
  ('dddddddd-0000-0000-0000-000000000101', 1, 0, 'Beta'),
  ('dddddddd-0000-0000-0000-000000000101', 1, 1, 'Gamma'),
  ('dddddddd-0000-0000-0000-000000000101', 2, 0, 'Delta'),
  ('dddddddd-0000-0000-0000-000000000101', 2, 1, 'Epsilon'),
  ('dddddddd-0000-0000-0000-000000000101', 2, 2, 'Zeta'),
  ('dddddddd-0000-0000-0000-000000000101', 2, 3, 'Eta');

select tests.authenticate_as('owner');
select set_config('tests.gid',
  public.create_group('Gruppo ragusano', 'dddddddd-0000-0000-0000-000000000101')::text, true);
reset role;

-- Inviti preparati come postgres: attivo (link), revocato, scaduto, esaurito, con email.
insert into public.group_invites (group_id, token_hash, invited_by)
values (tests.gid(), tests.token_hash('tok-active'), tests.uid('owner'));
insert into public.group_invites (group_id, token_hash, invited_by, status)
values (tests.gid(), tests.token_hash('tok-revoked'), tests.uid('owner'), 'revoked');
insert into public.group_invites (group_id, token_hash, invited_by, created_at, expires_at)
values (tests.gid(), tests.token_hash('tok-expired'), tests.uid('owner'), now() - interval '8 days', now() - interval '1 day');
insert into public.group_invites (group_id, token_hash, invited_by, max_uses, uses)
values (tests.gid(), tests.token_hash('tok-exhausted'), tests.uid('owner'), 1, 1);
insert into public.group_invites (group_id, token_hash, invited_by, email, max_uses)
values (tests.gid(), tests.token_hash('tok-email'), tests.uid('owner'), 'amico@test.local', 1);

----------------------------------------------------------------------------
-- INVITI VIA EMAIL ACCANTO AL LINK
----------------------------------------------------------------------------
select lives_ok(
  format($$insert into public.group_invites (group_id, token_hash, invited_by, email) values (%L, %L, %L, 'altro@test.local')$$,
    tests.gid(), tests.token_hash('tok-second-email'), tests.uid('owner')),
  'indice: gli inviti via email non contano nel limite del link'
);
select lives_ok(
  format($$insert into public.group_invites (group_id, token_hash, invited_by, status) values (%L, %L, %L, 'revoked')$$,
    tests.gid(), tests.token_hash('tok-second-revoked'), tests.uid('owner')),
  'indice: un link revocato non conta nel limite'
);

----------------------------------------------------------------------------
-- ANONIMO: stato dell'invito e anteprima, nessuna lettura delle tabelle
----------------------------------------------------------------------------
select tests.as_anon();
select is(public.invite_link_status('tok-active'), 'active', 'invite_status: anonimo, invito attivo');
select is(public.invite_link_status('tok-revoked'), 'revoked', 'invite_status: invito revocato');
select is(public.invite_link_status('tok-expired'), 'expired', 'invite_status: invito scaduto');
select is(public.invite_link_status('tok-exhausted'), 'exhausted', 'invite_status: usi esauriti');
select is(public.invite_link_status('tok-sconosciuto'), 'not_found', 'invite_status: token inesistente');
select results_eq(
  $$select place_name from public.invite_preview_stops('tok-active')$$,
  $$values ('Alfa'::text), ('Beta'::text), ('Gamma'::text), ('Delta'::text), ('Epsilon'::text), ('Zeta'::text)$$,
  'invite_preview_stops: anonimo, sei tappe distinte in ordine di giorno e posizione'
);
select is_empty($$select 1 from public.invite_preview_stops('tok-revoked')$$, 'invite_preview_stops: niente per un invito revocato');
select is_empty($$select 1 from public.invite_preview_stops('tok-expired')$$, 'invite_preview_stops: niente per un invito scaduto');
select is_empty($$select 1 from public.invite_preview_stops('tok-exhausted')$$, 'invite_preview_stops: niente per usi esauriti');
select throws_ok($$select * from public.group_invites$$, '42501', null, 'anonimo: non legge group_invites');
select throws_ok($$select * from public.group_members$$, '42501', null, 'anonimo: non legge group_members');
select throws_ok(
  format($$select public.leave_group(%L)$$, tests.gid()),
  '42501', null, 'anonimo: leave_group negata'
);
select throws_ok(
  format($$select public.remove_group_member(%L, %L)$$, tests.gid(), tests.uid('member')),
  '42501', null, 'anonimo: remove_group_member negata'
);
select throws_ok($$select public.accept_invite('tok-active')$$, '42501', null, 'anonimo: accept_invite negata');

----------------------------------------------------------------------------
-- OSPITE: legge l'anteprima, non entra e non gestisce il gruppo
----------------------------------------------------------------------------
select tests.authenticate_as('guest');
select is(public.invite_link_status('tok-active'), 'active', 'ospite: invite_status disponibile');
select isnt_empty($$select 1 from public.invite_preview_stops('tok-active')$$, 'ospite: anteprima delle tappe disponibile');
select throws_ok($$select public.accept_invite('tok-active')$$, 'P0001', 'guest_not_allowed', 'ospite: accept_invite rifiutata');
select throws_ok(
  format($$select public.leave_group(%L)$$, tests.gid()),
  'P0001', 'guest_not_allowed', 'ospite: leave_group rifiutata'
);
select throws_ok(
  format($$select public.remove_group_member(%L, %L)$$, tests.gid(), tests.uid('member')),
  'P0001', 'guest_not_allowed', 'ospite: remove_group_member rifiutata'
);
reset role;
select is_empty(
  format($$select 1 from public.group_members where user_id = %L$$, tests.uid('guest')),
  'ospite: nessun ingresso nel gruppo dopo i tentativi'
);

----------------------------------------------------------------------------
-- INGRESSO CON INVITO: membro e nuovo membro, invited_by, già membro
----------------------------------------------------------------------------
select tests.authenticate_as('member');
select is(public.accept_invite('tok-active'), tests.gid(), 'accept_invite: il membro entra con il link');
select is(public.accept_invite('tok-active'), tests.gid(), 'accept_invite: già membro, si torna al gruppo');
select is(public.accept_invite('tok-exhausted'), tests.gid(), 'accept_invite: un membro con un invito esaurito torna al gruppo');
reset role;
select is((select uses from public.group_invites where token_hash = tests.token_hash('tok-active')), 1::smallint, 'accept_invite: il ritorno di un membro non conta un uso');
select is(
  (select invited_by from public.group_members where group_id = tests.gid() and user_id = tests.uid('member')),
  tests.uid('owner'),
  'accept_invite: invited_by è l''autore dell''invito'
);

select tests.authenticate_as('joiner');
select is(public.accept_invite('tok-active'), tests.gid(), 'accept_invite: un secondo utente entra con lo stesso link');
reset role;
select is(
  (select invited_by from public.group_members where group_id = tests.gid() and user_id = tests.uid('joiner')),
  tests.uid('owner'),
  'accept_invite: invited_by anche per il secondo ingresso'
);

-- Gruppo a 30 membri (proprietario incluso): il prossimo ingresso è rifiutato.
do $$
begin
  for i in 1..27 loop
    perform tests.create_user('bulk' || i::text);
    insert into public.group_members (group_id, user_id) values (tests.gid(), tests.uid('bulk' || i::text));
  end loop;
end
$$;
select results_eq(
  format($$select count(*)::int from public.group_members where group_id = %L$$, tests.gid()),
  $$values (30)$$,
  'gruppo: trenta membri, proprietario incluso'
);

select tests.authenticate_as('other');
select throws_ok(
  $$select public.accept_invite('tok-active')$$,
  'P0001', 'group_full', 'accept_invite: gruppo pieno con trenta membri'
);
reset role;
select is_empty(
  format($$select 1 from public.group_members where group_id = %L and user_id = %L$$, tests.gid(), tests.uid('other')),
  'gruppo pieno: nessun ingresso'
);

----------------------------------------------------------------------------
-- USCITA: leave_group
----------------------------------------------------------------------------
select tests.authenticate_as('other');
select throws_ok(
  format($$select public.leave_group(%L)$$, tests.gid()),
  'P0001', 'not_group_member', 'leave_group: chi non è membro non può uscire'
);
reset role;

select tests.authenticate_as('owner');
select throws_ok(
  format($$select public.leave_group(%L)$$, tests.gid()),
  'P0001', 'cannot_leave_as_owner', 'leave_group: il proprietario non esce senza cedere la proprietà'
);
reset role;

select tests.authenticate_as('member');
select lives_ok(
  format($$select public.leave_group(%L)$$, tests.gid()),
  'leave_group: il membro esce'
);
select throws_ok(
  format($$select public.leave_group(%L)$$, tests.gid()),
  'P0001', 'not_group_member', 'leave_group: uscire due volte non è più possibile'
);

-- Ex membro: perde subito gruppo, inviti, itinerario, tappe e profili dei compagni.
select is_empty($$select 1 from public.groups$$, 'ex membro: non vede più il gruppo');
select is_empty($$select 1 from public.group_invites$$, 'ex membro: non vede più gli inviti');
select is_empty(
  $$select 1 from public.itineraries where id = 'dddddddd-0000-0000-0000-000000000101'$$,
  'ex membro: non vede più l''itinerario del gruppo'
);
select is_empty(
  $$select 1 from public.itinerary_items where itinerary_id = 'dddddddd-0000-0000-0000-000000000101'$$,
  'ex membro: non vede più le tappe'
);
select is_empty($$select 1 from public.group_member_profiles$$, 'ex membro: non vede più i profili dei compagni');
reset role;

----------------------------------------------------------------------------
-- RIMOZIONE: remove_group_member
----------------------------------------------------------------------------
select tests.authenticate_as('joiner');
select throws_ok(
  format($$select public.remove_group_member(%L, %L)$$, tests.gid(), tests.uid('bulk1')),
  'P0001', 'not_group_owner', 'remove_group_member: un membro non rimuove altri'
);
reset role;

select tests.authenticate_as('admin');
select throws_ok(
  format($$select public.remove_group_member(%L, %L)$$, tests.gid(), tests.uid('joiner')),
  'P0001', 'not_group_owner', 'remove_group_member: l''admin non è owner del gruppo'
);
reset role;

select tests.authenticate_as('owner');
select throws_ok(
  format($$select public.remove_group_member(%L, %L)$$, tests.gid(), tests.uid('owner')),
  'P0001', 'cannot_remove_owner', 'remove_group_member: il proprietario non si rimuove'
);
select throws_ok(
  format($$select public.remove_group_member(%L, %L)$$, tests.gid(), tests.uid('other')),
  'P0001', 'not_group_member', 'remove_group_member: non si rimuove chi non è membro'
);
select lives_ok(
  format($$select public.remove_group_member(%L, %L)$$, tests.gid(), tests.uid('joiner')),
  'remove_group_member: il proprietario rimuove un membro'
);
reset role;
select is_empty(
  format($$select 1 from public.group_members where group_id = %L and user_id = %L$$, tests.gid(), tests.uid('joiner')),
  'remove_group_member: il membro rimosso non c''è più'
);

select tests.authenticate_as('joiner');
select is_empty($$select 1 from public.groups$$, 'membro rimosso: non vede più il gruppo');
select is_empty($$select 1 from public.item_votes$$, 'membro rimosso: non vede più i voti');
reset role;

----------------------------------------------------------------------------
-- ALTRO UTENTE E ADMIN: nessun accesso agli inviti né ai membri
----------------------------------------------------------------------------
select tests.authenticate_as('other');
select is_empty($$select 1 from public.group_invites$$, 'altro utente: non vede gli inviti');
select is_empty(
  format($$select 1 from public.group_members where group_id = %L$$, tests.gid()),
  'altro utente: non vede i membri'
);
select is(public.invite_link_status('tok-active'), 'active', 'altro utente: invite_status disponibile con il token');
reset role;

select tests.authenticate_as('admin');
select is_empty($$select 1 from public.group_invites$$, 'admin: non vede gli inviti');
select is_empty(
  format($$select 1 from public.group_members where group_id = %L$$, tests.gid()),
  'admin: non vede i membri'
);
reset role;

select is(has_function_privilege('anon', 'public.accept_invite(text)', 'EXECUTE'), false, 'anon non esegue accept_invite');
select is(has_function_privilege('anon', 'public.leave_group(uuid)', 'EXECUTE'), false, 'anon non esegue leave_group');
select is(has_function_privilege('anon', 'public.remove_group_member(uuid, uuid)', 'EXECUTE'), false, 'anon non esegue remove_group_member');
select * from finish();
rollback;
