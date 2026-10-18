-- Ospiti (sessione anonima): itinerari propri sì; gruppi, inviti, voti, recensioni, check-in
-- e punti no. Conversione in account con lo stesso user id; pulizia degli ospiti inattivi.
-- Ruoli: anonimo (senza sessione), ospite, altro ospite, utente, admin.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_guest('guest');
select tests.create_guest('guest2');
select tests.create_user('user');
select tests.create_user('admin', true);

create function tests.token_hash(p_token text) returns text language sql immutable
as $$ select encode(sha256(convert_to(p_token, 'UTF8')), 'hex') $$;

-- Gruppo di user con un invito valido e una tappa votabile.
select tests.authenticate_as('user');
insert into public.itineraries (id, owner_id, title, days)
values ('aaaaaaaa-0000-0000-0000-000000000001', tests.uid('user'), 'Di user', 3);
insert into public.itinerary_items (id, itinerary_id, day_index, position, custom_title)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 0, 0, 'Etna');
select set_config('tests.gid', public.create_group('Viaggio', 'aaaaaaaa-0000-0000-0000-000000000001')::text, true);
insert into public.group_invites (group_id, token_hash, invited_by)
values (current_setting('tests.gid')::uuid, tests.token_hash('tok-guest'), tests.uid('user'));
reset role;

----------------------------------------------------------------------------
-- CLAIM
----------------------------------------------------------------------------
select tests.authenticate_as('guest');
select is((select (auth.jwt()->>'is_anonymous')::boolean), true, 'ospite: claim is_anonymous = true');
select tests.authenticate_as('user');
select is((select (auth.jwt()->>'is_anonymous')::boolean), false, 'utente: claim is_anonymous = false');
reset role;

----------------------------------------------------------------------------
-- ITINERARI: l'ospite crea e modifica i propri, non vede quelli degli altri
----------------------------------------------------------------------------
select tests.authenticate_as('guest');
select lives_ok(
  format($$insert into public.itineraries (id, owner_id, title, days)
           values ('aaaaaaaa-0000-0000-0000-000000000002', %L, 'Da ospite', 2)$$, tests.uid('guest')),
  'ospite: crea un proprio itinerario'
);
select lives_ok(
  $$insert into public.itinerary_items (itinerary_id, day_index, position, custom_title)
    values ('aaaaaaaa-0000-0000-0000-000000000002', 0, 0, 'Noto')$$,
  'ospite: aggiunge una tappa'
);
update public.itineraries set title = 'Da ospite, rivisto' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select is(
  (select title from public.itineraries where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  'Da ospite, rivisto',
  'ospite: modifica il proprio itinerario'
);
select is_empty(
  $$select 1 from public.itineraries where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  'ospite: non vede l''itinerario di un altro'
);

select tests.authenticate_as('guest2');
select is_empty(
  $$select 1 from public.itineraries where id = 'aaaaaaaa-0000-0000-0000-000000000002'$$,
  'altro ospite: non vede l''itinerario dell''ospite'
);
select tests.authenticate_as('user');
select is_empty(
  $$select 1 from public.itineraries where id = 'aaaaaaaa-0000-0000-0000-000000000002'$$,
  'utente: non vede l''itinerario dell''ospite'
);
select tests.as_anon();
select is_empty(
  $$select 1 from public.itineraries where id = 'aaaaaaaa-0000-0000-0000-000000000002'$$,
  'anonimo senza sessione: non vede l''itinerario dell''ospite'
);
reset role;

----------------------------------------------------------------------------
-- GRUPPI: né creazione né ingresso
----------------------------------------------------------------------------
select tests.authenticate_as('guest');
select throws_ok(
  $$select public.create_group('Mio gruppo')$$,
  'P0001', 'guest_not_allowed', 'ospite: create_group rifiutata'
);
select throws_ok(
  $$select public.create_group('Mio gruppo', 'aaaaaaaa-0000-0000-0000-000000000002')$$,
  'P0001', 'guest_not_allowed', 'ospite: create_group rifiutata anche con il proprio itinerario'
);
select throws_ok(
  $$select public.accept_invite('tok-guest')$$,
  'P0001', 'guest_not_allowed', 'ospite: accept_invite rifiutata con un invito valido'
);
reset role;
select is_empty(
  format($$select 1 from public.group_members where user_id = %L$$, tests.uid('guest')),
  'ospite: nessuna appartenenza a gruppi'
);
select is(
  (select uses from public.group_invites where token_hash = tests.token_hash('tok-guest')),
  0::smallint,
  'ospite: l''invito non è stato consumato'
);

----------------------------------------------------------------------------
-- INVITI E VOTI: rifiutati anche se l'ospite fosse proprietario o membro
-- (situazione impossibile dalle funzioni: la creiamo come postgres per provare le policy)
----------------------------------------------------------------------------
insert into public.groups (id, name, owner_id)
values ('cccccccc-0000-0000-0000-000000000001', 'Forzato', tests.uid('guest'));
insert into public.group_members (group_id, user_id, role)
values (current_setting('tests.gid')::uuid, tests.uid('guest'), 'member');

select tests.authenticate_as('guest');
select throws_ok(
  format($$insert into public.group_invites (group_id, token_hash, invited_by)
           values ('cccccccc-0000-0000-0000-000000000001', %L, %L)$$, tests.token_hash('x'), tests.uid('guest')),
  '42501', null, 'ospite: non crea inviti, nemmeno per un gruppo che possiede'
);
select throws_ok(
  format($$insert into public.item_votes (itinerary_item_id, user_id, value)
           values ('bbbbbbbb-0000-0000-0000-000000000001', %L, 1)$$, tests.uid('guest')),
  '42501', null, 'ospite: non vota, nemmeno se membro'
);
reset role;

insert into public.item_votes (itinerary_item_id, user_id, value)
values ('bbbbbbbb-0000-0000-0000-000000000001', tests.uid('guest'), 1);
select tests.authenticate_as('guest');
select throws_ok(
  $$update public.item_votes set value = -1 where itinerary_item_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  '42501', null, 'ospite: non cambia un voto'
);
reset role;
delete from public.item_votes where user_id = tests.uid('guest');
delete from public.group_members where user_id = tests.uid('guest');
delete from public.groups where id = 'cccccccc-0000-0000-0000-000000000001';

-- L'utente con account vota e invita come prima.
select tests.authenticate_as('user');
select lives_ok(
  format($$insert into public.item_votes (itinerary_item_id, user_id, value)
           values ('bbbbbbbb-0000-0000-0000-000000000001', %L, 1)$$, tests.uid('user')),
  'utente: vota nel proprio gruppo'
);
select lives_ok(
  format($$insert into public.group_invites (group_id, token_hash, invited_by)
           values (%L, %L, %L)$$, current_setting('tests.gid'), tests.token_hash('y'), tests.uid('user')),
  'utente: invita nel proprio gruppo'
);
reset role;

----------------------------------------------------------------------------
-- RECENSIONI E CHECK-IN
----------------------------------------------------------------------------
insert into public.places (id, slug, name, province, lat, lng)
values ('dddddddd-0000-0000-0000-000000000001', 'int-guest-place', 'Luogo', 'SR', 37, 15);
insert into public.activities (id, slug, place_id, title, duration_min)
values ('eeeeeeee-0000-0000-0000-000000000001', 'int-guest-activity', 'dddddddd-0000-0000-0000-000000000001', 'Attività', 60);

select tests.authenticate_as('guest');
select throws_ok(
  format($$insert into public.reviews (user_id, activity_id, rating, body)
           values (%L, 'eeeeeeee-0000-0000-0000-000000000001', 5, 'Bello')$$, tests.uid('guest')),
  '42501', null, 'ospite: non recensisce'
);
reset role;

insert into public.reviews (user_id, activity_id, rating, body)
values (tests.uid('guest'), 'eeeeeeee-0000-0000-0000-000000000001', 3, 'Inserita da postgres');
select tests.authenticate_as('guest');
select throws_ok(
  $$update public.reviews set rating = 5 where activity_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  '42501', null, 'ospite: non modifica una recensione'
);
select throws_ok(
  format($$insert into public.check_ins (user_id, place_id)
           values (%L, 'dddddddd-0000-0000-0000-000000000001')$$, tests.uid('guest')),
  '42501', null, 'ospite: non fa check-in'
);
reset role;
delete from public.reviews where user_id = tests.uid('guest');

-- Le recensioni passano da submit_review (passo 5.1): il client non le inserisce.
select tests.authenticate_as('user');
select throws_ok(
  format($$insert into public.reviews (user_id, activity_id, rating, body)
           values (%L, 'eeeeeeee-0000-0000-0000-000000000001', 5, 'Bello')$$, tests.uid('user')),
  '42501', null, 'utente: non recensisce direttamente'
);
reset role;

----------------------------------------------------------------------------
-- PUNTI
----------------------------------------------------------------------------
select is(
  public.award_points(tests.uid('guest'), 50, 'itinerary_completed', 'itinerary', 'aaaaaaaa-0000-0000-0000-000000000002'),
  false,
  'award_points: nessun punto a un ospite'
);
select is_empty(
  format($$select 1 from public.points_ledger where user_id = %L$$, tests.uid('guest')),
  'award_points: nessuna riga nel ledger dell''ospite'
);
select is(
  public.award_points(tests.uid('user'), 50, 'itinerary_completed', 'itinerary', 'aaaaaaaa-0000-0000-0000-000000000001'),
  true,
  'award_points: l''utente con account riceve i punti'
);

----------------------------------------------------------------------------
-- CONVERSIONE: stesso user id, i dati restano suoi, le restrizioni cadono
----------------------------------------------------------------------------
update auth.users set is_anonymous = false, email = 'int-guest-converted@example.com'
where id = tests.uid('guest');
select set_config('tests.guest_guest', 'false', true); -- il nuovo JWT non ha più is_anonymous

select tests.authenticate_as('guest');
select is(
  (select owner_id from public.itineraries where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  tests.uid('guest'),
  'conversione: l''itinerario è ancora suo'
);
select lives_ok(
  $$select public.create_group('Ora posso', 'aaaaaaaa-0000-0000-0000-000000000002')$$,
  'conversione: crea un gruppo'
);
reset role;
select is(
  public.award_points(tests.uid('guest'), 50, 'itinerary_completed', 'itinerary', 'aaaaaaaa-0000-0000-0000-000000000002'),
  true,
  'conversione: riceve i punti'
);

----------------------------------------------------------------------------
-- PULIZIA DEGLI OSPITI INATTIVI
----------------------------------------------------------------------------
select tests.create_guest('old');
select tests.create_guest('old_active');
select tests.create_guest('fresh');
select tests.create_user('old_user');

update auth.users set created_at = now() - interval '40 days', updated_at = now() - interval '40 days',
  last_sign_in_at = now() - interval '40 days'
where id in (tests.uid('old'), tests.uid('old_active'), tests.uid('old_user'));
-- old_active ha rinnovato la sessione 2 giorni fa.
insert into auth.sessions (id, user_id, created_at, updated_at, refreshed_at)
values (gen_random_uuid(), tests.uid('old_active'), now() - interval '40 days', now() - interval '2 days',
  (now() - interval '2 days') at time zone 'UTC');

insert into public.itineraries (id, owner_id, title, days)
values ('aaaaaaaa-0000-0000-0000-000000000003', tests.uid('old'), 'Vecchio ospite', 2);

select tests.authenticate_as('user');
select throws_ok($$select public.delete_inactive_guests(30)$$, '42501', null, 'utente: non esegue la pulizia');
select tests.as_anon();
select throws_ok($$select public.delete_inactive_guests(30)$$, '42501', null, 'anonimo: non esegue la pulizia');
select tests.authenticate_as('admin');
select throws_ok($$select public.delete_inactive_guests(30)$$, '42501', null, 'admin: non esegue la pulizia (solo il cron)');
reset role;

select throws_ok($$select public.delete_inactive_guests(0)$$, 'P0001', 'invalid_days', 'pulizia: giorni non validi');
select ok(public.delete_inactive_guests(30) >= 1, 'pulizia: elimina almeno un ospite');
select is_empty(format($$select 1 from auth.users where id = %L$$, tests.uid('old')), 'pulizia: ospite inattivo eliminato');
select is_empty(
  $$select 1 from public.itineraries where id = 'aaaaaaaa-0000-0000-0000-000000000003'$$,
  'pulizia: i suoi itinerari eliminati'
);
select isnt_empty(format($$select 1 from auth.users where id = %L$$, tests.uid('old_active')), 'pulizia: ospite con sessione recente resta');
select isnt_empty(format($$select 1 from auth.users where id = %L$$, tests.uid('fresh')), 'pulizia: ospite recente resta');
select isnt_empty(format($$select 1 from auth.users where id = %L$$, tests.uid('old_user')), 'pulizia: utente con account resta');
select isnt_empty(format($$select 1 from auth.users where id = %L$$, tests.uid('guest')), 'pulizia: ospite convertito resta');

select * from finish();
rollback;
