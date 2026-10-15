-- Gruppi: groups, group_members, group_invites, item_votes, itinerari di gruppo,
-- funzioni create_group, accept_invite, invite_preview, transfer_group_ownership,
-- viste item_vote_balances e group_member_profiles.
-- Ruoli: anonimo, owner, membro, ex membro, altro utente, admin (+ joiner per gli inviti).
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('owner');
select tests.create_user('member');
select tests.create_user('ex');
select tests.create_user('other');
select tests.create_user('joiner');
select tests.create_user('admin', true);

create function tests.token_hash(p_token text) returns text language sql immutable
as $$ select encode(sha256(convert_to(p_token, 'UTF8')), 'hex') $$;

create function tests.gid() returns uuid language sql stable
as $$ select current_setting('tests.gid')::uuid $$;

-- Itinerario di other, per verificare che non si possa collegare a un gruppo altrui.
insert into public.itineraries (id, owner_id, title, days)
values ('dddddddd-0000-0000-0000-000000000009', tests.uid('other'), 'Di other', 2);

----------------------------------------------------------------------------
-- CREAZIONE DEL GRUPPO (owner)
----------------------------------------------------------------------------
select tests.authenticate_as('owner');

insert into public.itineraries (id, owner_id, title, days)
values ('dddddddd-0000-0000-0000-000000000001', tests.uid('owner'), 'Sicilia orientale', 4);
insert into public.itinerary_items (id, itinerary_id, day_index, position, custom_title)
values ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 0, 0, 'Etna');

select throws_ok(
  $$select public.create_group('Rubato', 'dddddddd-0000-0000-0000-000000000009')$$,
  'P0001', 'itinerary_not_available', 'create_group: rifiuta l''itinerario di un altro utente'
);
select throws_ok(
  format($$insert into public.groups (name, owner_id) values ('Diretto', %L)$$, tests.uid('owner')),
  '42501', null, 'owner: non inserisce gruppi direttamente'
);

select set_config('tests.gid',
  public.create_group('Viaggio', 'dddddddd-0000-0000-0000-000000000001')::text, true);

select results_eq(
  $$select role::text from public.group_members where group_id = tests.gid()$$,
  $$values ('owner')$$,
  'create_group: l''owner diventa membro con ruolo owner'
);
select is(
  (select group_id from public.itineraries where id = 'dddddddd-0000-0000-0000-000000000001'),
  tests.gid(),
  'create_group: l''itinerario è collegato al gruppo'
);

insert into public.group_invites (group_id, token_hash, invited_by)
values (tests.gid(), tests.token_hash('tok-valid'), tests.uid('owner'));
insert into public.group_invites (group_id, token_hash, invited_by)
values (tests.gid(), tests.token_hash('tok-revoked'), tests.uid('owner'));
select lives_ok(
  $$update public.group_invites set status = 'revoked' where token_hash = tests.token_hash('tok-revoked')$$,
  'owner: revoca un invito'
);
select throws_ok(
  $$update public.group_invites set status = 'active' where token_hash = tests.token_hash('tok-revoked')$$,
  '42501', null, 'owner: non riattiva un invito revocato'
);
select throws_ok(
  $$update public.group_invites set uses = 0$$,
  '42501', null, 'owner: non modifica il contatore degli usi'
);

reset role;
-- Invito scaduto e invito con usi esauriti, preparati come postgres.
insert into public.group_invites (group_id, token_hash, invited_by, created_at, expires_at)
values (tests.gid(), tests.token_hash('tok-expired'), tests.uid('owner'), now() - interval '8 days', now() - interval '1 day');
insert into public.group_invites (group_id, token_hash, invited_by, max_uses, uses)
values (tests.gid(), tests.token_hash('tok-exhausted'), tests.uid('owner'), 1, 1);

----------------------------------------------------------------------------
-- ACCEPT_INVITE
----------------------------------------------------------------------------
select tests.authenticate_as('member');
select is(public.accept_invite('tok-valid'), tests.gid(), 'accept_invite: token valido, il membro entra');
select is(public.accept_invite('tok-valid'), tests.gid(), 'accept_invite: utente già membro, si torna al gruppo');

reset role;
select tests.authenticate_as('ex');
select is(public.accept_invite('tok-valid'), tests.gid(), 'accept_invite: secondo uso dello stesso link');

reset role;
select is(
  (select uses from public.group_invites where token_hash = tests.token_hash('tok-valid')),
  2::smallint,
  'accept_invite: uses conta due ingressi, non il tentativo del già membro'
);

select tests.authenticate_as('joiner');
select throws_ok($$select public.accept_invite('tok-expired')$$, 'P0001', 'invite_expired', 'accept_invite: token scaduto');
select throws_ok($$select public.accept_invite('tok-revoked')$$, 'P0001', 'invite_revoked', 'accept_invite: token revocato');
select throws_ok($$select public.accept_invite('tok-exhausted')$$, 'P0001', 'invite_exhausted', 'accept_invite: usi esauriti');
select throws_ok($$select public.accept_invite('tok-sconosciuto')$$, 'P0001', 'invite_not_found', 'accept_invite: token inesistente');
reset role;
select is_empty(
  format($$select 1 from public.group_members where user_id = %L$$, tests.uid('joiner')),
  'accept_invite: nessun ingresso dopo i tentativi falliti'
);

select tests.as_anon();
select throws_ok($$select public.accept_invite('tok-valid')$$, '42501', null, 'accept_invite: anon non può accettare');
select results_eq(
  $$select group_name, itinerary_title from public.invite_preview('tok-valid')$$,
  $$values ('Viaggio', 'Sicilia orientale')$$,
  'invite_preview: anon vede nome del gruppo e itinerario con un token valido'
);
select is_empty($$select 1 from public.invite_preview('tok-revoked')$$, 'invite_preview: niente per un token revocato');
select is_empty($$select 1 from public.invite_preview('tok-expired')$$, 'invite_preview: niente per un token scaduto');
select throws_ok($$select * from public.groups$$, '42501', null, 'anon: non legge groups');
select throws_ok($$select * from public.group_members$$, '42501', null, 'anon: non legge group_members');
select throws_ok($$select * from public.item_votes$$, '42501', null, 'anon: non legge item_votes');
select is_empty(
  $$select 1 from public.itineraries where id = 'dddddddd-0000-0000-0000-000000000001'$$,
  'anon: non vede l''itinerario del gruppo'
);

----------------------------------------------------------------------------
-- MEMBRO
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('member');

select results_eq($$select name from public.groups$$, $$values ('Viaggio')$$, 'membro: vede il gruppo');
select results_eq(
  $$select count(*)::int from public.group_members where group_id = tests.gid()$$,
  $$values (3)$$,
  'membro: vede i membri del gruppo'
);
select isnt_empty(
  $$select 1 from public.itineraries where id = 'dddddddd-0000-0000-0000-000000000001'$$,
  'membro: vede l''itinerario del gruppo'
);
select lives_ok(
  $$insert into public.itinerary_items (itinerary_id, day_index, position, custom_title) values ('dddddddd-0000-0000-0000-000000000001', 1, 0, 'Taormina')$$,
  'membro: aggiunge voci all''itinerario del gruppo'
);
select is_empty($$select 1 from public.group_invites$$, 'membro: non vede gli inviti');
select throws_ok(
  format($$insert into public.group_invites (group_id, token_hash, invited_by) values (%L, %L, %L)$$,
    tests.gid(), tests.token_hash('tok-member'), tests.uid('member')),
  '42501', null, 'membro: non crea inviti'
);
select throws_ok(
  format($$insert into public.group_members (group_id, user_id) values (%L, %L)$$, tests.gid(), tests.uid('other')),
  '42501', null, 'membro: non aggiunge membri'
);
delete from public.group_members where user_id = tests.uid('ex');
update public.groups set name = 'hack';
select results_eq(
  $$select public.group_member_profiles.display_name from public.group_member_profiles where user_id = tests.uid('owner')$$,
  $$values ('owner')$$,
  'membro: vede nome del compagno tramite group_member_profiles'
);
select is_empty(
  format($$select 1 from public.profiles where id = %L$$, tests.uid('owner')),
  'membro: non legge il profilo completo del compagno'
);
reset role;
select isnt_empty(
  format($$select 1 from public.group_members where user_id = %L$$, tests.uid('ex')),
  'membro: non rimuove un altro membro'
);
select is((select name from public.groups where id = tests.gid()), 'Viaggio', 'membro: non rinomina il gruppo');

----------------------------------------------------------------------------
-- VOTI E SALDO
----------------------------------------------------------------------------
select tests.authenticate_as('owner');
insert into public.item_votes (itinerary_item_id, user_id, value)
values ('eeeeeeee-0000-0000-0000-000000000001', tests.uid('owner'), 1);
update public.groups set name = 'Viaggio in Sicilia';
reset role;
select is((select name from public.groups where id = tests.gid()), 'Viaggio in Sicilia', 'owner: rinomina il gruppo');

select tests.authenticate_as('member');
select lives_ok(
  format($$insert into public.item_votes (itinerary_item_id, user_id, value) values ('eeeeeeee-0000-0000-0000-000000000001', %L, 1)$$, tests.uid('member')),
  'membro: vota una voce'
);
select throws_ok(
  format($$insert into public.item_votes (itinerary_item_id, user_id, value) values ('eeeeeeee-0000-0000-0000-000000000001', %L, -1)$$, tests.uid('other')),
  '42501', null, 'membro: non vota a nome di altri'
);
update public.item_votes set value = -1 where user_id = tests.uid('owner');
reset role;
select tests.authenticate_as('ex');
select lives_ok(
  format($$insert into public.item_votes (itinerary_item_id, user_id, value) values ('eeeeeeee-0000-0000-0000-000000000001', %L, -1)$$, tests.uid('ex')),
  'futuro ex membro: vota mentre è membro'
);
reset role;
select is(
  (select value from public.item_votes where user_id = tests.uid('owner')),
  1::smallint,
  'membro: non modifica il voto di un altro'
);

select tests.authenticate_as('member');
select results_eq(
  $$select balance, up_votes, down_votes from public.item_vote_balances where itinerary_item_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  $$values (1, 2, 1)$$,
  'saldo: +1 +1 -1 con tre membri'
);

----------------------------------------------------------------------------
-- EX MEMBRO: esce e perde subito ogni accesso
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('ex');
select lives_ok(
  format($$delete from public.group_members where group_id = %L and user_id = %L$$, tests.gid(), tests.uid('ex')),
  'ex membro: esce dal gruppo'
);
select is_empty($$select 1 from public.groups$$, 'ex membro: non vede più il gruppo');
select is_empty($$select 1 from public.group_members$$, 'ex membro: non vede più i membri');
select is_empty(
  $$select 1 from public.itineraries where id = 'dddddddd-0000-0000-0000-000000000001'$$,
  'ex membro: non vede più l''itinerario'
);
select is_empty(
  $$select 1 from public.itinerary_items where itinerary_id = 'dddddddd-0000-0000-0000-000000000001'$$,
  'ex membro: non vede più le voci'
);
select is_empty($$select 1 from public.item_votes$$, 'ex membro: non vede più i voti, nemmeno il proprio');
select is_empty($$select 1 from public.group_member_profiles$$, 'ex membro: non vede più i profili dei compagni');
select throws_ok(
  $$insert into public.itinerary_items (itinerary_id, day_index, position, custom_title) values ('dddddddd-0000-0000-0000-000000000001', 2, 0, 'hack')$$,
  '42501', null, 'ex membro: non aggiunge voci'
);
update public.item_votes set value = 1 where user_id = tests.uid('ex');
reset role;
select is(
  (select value from public.item_votes where user_id = tests.uid('ex')),
  -1::smallint,
  'ex membro: non modifica il proprio voto'
);
select is(
  (select count(*)::int from public.item_votes where itinerary_item_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  3,
  'ex membro: il suo voto resta registrato'
);

select tests.authenticate_as('member');
select results_eq(
  $$select balance, up_votes, down_votes from public.item_vote_balances where itinerary_item_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  $$values (2, 2, 0)$$,
  'saldo: il voto dell''ex membro non conta'
);

----------------------------------------------------------------------------
-- ALTRO UTENTE E ADMIN: nessun accesso al gruppo
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('other');
select is_empty($$select 1 from public.groups$$, 'altro utente: non vede il gruppo');
select is_empty($$select 1 from public.group_members where group_id = tests.gid()$$, 'altro utente: non vede i membri');
select is_empty($$select 1 from public.group_invites$$, 'altro utente: non vede gli inviti');
select is_empty($$select 1 from public.item_votes$$, 'altro utente: non vede i voti');
select is_empty($$select 1 from public.item_vote_balances$$, 'altro utente: non vede i saldi');
select is_empty($$select 1 from public.group_member_profiles$$, 'altro utente: non vede i profili dei membri');
select throws_ok(
  format($$insert into public.item_votes (itinerary_item_id, user_id, value) values ('eeeeeeee-0000-0000-0000-000000000001', %L, 1)$$, tests.uid('other')),
  '42501', null, 'altro utente: non vota'
);
select throws_ok(
  format($$insert into public.group_invites (group_id, token_hash, invited_by) values (%L, %L, %L)$$,
    tests.gid(), tests.token_hash('tok-other'), tests.uid('other')),
  '42501', null, 'altro utente: non crea inviti'
);

reset role;
select tests.authenticate_as('admin');
select is_empty($$select 1 from public.groups$$, 'admin: non vede il gruppo');
select is_empty($$select 1 from public.group_members where group_id = tests.gid()$$, 'admin: non vede i membri');
select is_empty($$select 1 from public.group_invites$$, 'admin: non vede gli inviti');
select is_empty($$select 1 from public.item_votes$$, 'admin: non vede i voti');
select is_empty(
  $$select 1 from public.itineraries where id = 'dddddddd-0000-0000-0000-000000000001'$$,
  'admin: non vede l''itinerario del gruppo'
);

----------------------------------------------------------------------------
-- PROPRIETÀ: l'owner esce solo dopo averla ceduta
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('owner');
delete from public.group_members where group_id = tests.gid() and user_id = tests.uid('owner');
delete from public.groups where id = tests.gid();
reset role;
select isnt_empty(
  format($$select 1 from public.group_members where user_id = %L and group_id = %L$$, tests.uid('owner'), tests.gid()),
  'owner: non può uscire senza cedere la proprietà'
);
select isnt_empty(
  format($$select 1 from public.groups where id = %L$$, tests.gid()),
  'owner con altri membri: eliminazione del gruppo rifiutata'
);

select tests.authenticate_as('member');
select throws_ok(
  format($$select public.transfer_group_ownership(%L, %L)$$, tests.gid(), tests.uid('member')),
  'P0001', 'not_group_owner', 'transfer: solo l''owner cede la proprietà'
);

reset role;
select tests.authenticate_as('owner');
select throws_ok(
  format($$select public.transfer_group_ownership(%L, %L)$$, tests.gid(), tests.uid('other')),
  'P0001', 'new_owner_not_member', 'transfer: il nuovo owner deve essere membro'
);
select lives_ok(
  format($$select public.transfer_group_ownership(%L, %L)$$, tests.gid(), tests.uid('member')),
  'transfer: l''owner cede la proprietà a un membro'
);
select lives_ok(
  format($$delete from public.group_members where group_id = %L and user_id = %L$$, tests.gid(), tests.uid('owner')),
  'transfer: il vecchio owner ora può uscire'
);
reset role;
select is((select owner_id from public.groups where id = tests.gid()), tests.uid('member'), 'transfer: nuovo owner del gruppo');
select is(
  (select owner_id from public.itineraries where id = 'dddddddd-0000-0000-0000-000000000001'),
  tests.uid('member'),
  'transfer: passa anche l''itinerario collegato'
);

-- Dopo la cessione il vecchio owner è uscito: il nuovo owner è l'unico membro e può eliminare.
select tests.authenticate_as('member');
select lives_ok(
  format($$delete from public.groups where id = %L$$, tests.gid()),
  'nuovo owner rimasto unico membro: elimina il gruppo'
);
reset role;
select is_empty(
  format($$select 1 from public.groups where id = %L$$, tests.gid()),
  'nuovo owner rimasto unico membro: il gruppo non esiste più'
);

----------------------------------------------------------------------------
-- VISTE: modalità di sicurezza
----------------------------------------------------------------------------
select ok(
  (select 'security_invoker=true' = any(reloptions) from pg_class where oid = 'public.item_vote_balances'::regclass),
  'item_vote_balances è security_invoker: si applica la RLS di item_votes e group_members del chiamante'
);
select ok(
  (select not coalesce('security_invoker=true' = any(reloptions), false)
      and 'security_barrier=true' = any(reloptions)
   from pg_class where oid = 'public.group_member_profiles'::regclass),
  'group_member_profiles non è security_invoker: filtra internamente con is_group_member del chiamante'
);

----------------------------------------------------------------------------
-- OWNER UNICO MEMBRO: può eliminare il gruppo
----------------------------------------------------------------------------
select tests.authenticate_as('other');
select set_config('tests.solo_gid',
  public.create_group('Da solo', 'dddddddd-0000-0000-0000-000000000009')::text, true);
select results_eq(
  $$select count(*)::int from public.group_members where group_id = current_setting('tests.solo_gid')::uuid$$,
  $$values (1)$$,
  'owner unico membro: il gruppo ha solo l''owner'
);
delete from public.group_members where group_id = current_setting('tests.solo_gid')::uuid;
reset role;
select isnt_empty(
  $$select 1 from public.group_members where group_id = current_setting('tests.solo_gid')::uuid$$,
  'owner unico membro: non esce lasciando un gruppo senza owner'
);
select tests.authenticate_as('other');
select lives_ok(
  $$delete from public.groups where id = current_setting('tests.solo_gid')::uuid$$,
  'owner unico membro: elimina il gruppo'
);
reset role;
select is_empty(
  $$select 1 from public.groups where id = current_setting('tests.solo_gid')::uuid$$,
  'owner unico membro: il gruppo non esiste più'
);
select is_empty(
  $$select 1 from public.group_members where group_id = current_setting('tests.solo_gid')::uuid$$,
  'owner unico membro: le righe dei membri sono eliminate a cascata'
);
select results_eq(
  $$select owner_id, group_id from public.itineraries where id = 'dddddddd-0000-0000-0000-000000000009'$$,
  format($$values (%L::uuid, null::uuid)$$, tests.uid('other')),
  'owner unico membro: l''itinerario resta suo e torna personale'
);

select * from finish();
rollback;
