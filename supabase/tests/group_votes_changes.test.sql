-- Passo 4.2: voti (itinerary_id dal trigger), registro delle modifiche, proposte, notifiche,
-- decide_proposal, replace_group_stop, guardia sull'attività, realtime, immutabilità, ospiti, admin.
-- Dati creati nella transazione del test: nessuna dipendenza dal seed o dal database locale.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('owner');
select tests.create_user('member');
select tests.create_user('other');
select tests.create_user('admin', true);
select tests.create_guest('guest');

create function tests.gid() returns uuid language sql stable
as $$ select current_setting('tests.gid')::uuid $$;

-- Catalogo: due attività attive (A1, A2) e una inattiva (A3), in un luogo di un'area di test.
insert into public.areas (id, slug, name_it, name_en)
values ('dddddddd-0000-0000-0000-000000000001', 'v42-area', 'Area test', 'Test area');
insert into public.places (id, slug, name, province, area_id, lat, lng)
values ('dddddddd-0000-0000-0000-000000000002', 'v42-luogo', 'Luogo test', 'PA',
  'dddddddd-0000-0000-0000-000000000001', 38.1157, 13.3615);
insert into public.activities (id, slug, place_id, title, duration_min, is_active) values
  ('dddddddd-0000-0000-0000-000000000003', 'v42-a1', 'dddddddd-0000-0000-0000-000000000002', 'Attività uno', 60, true),
  ('dddddddd-0000-0000-0000-000000000004', 'v42-a2', 'dddddddd-0000-0000-0000-000000000002', 'Attività due', 60, true),
  ('dddddddd-0000-0000-0000-000000000005', 'v42-a3', 'dddddddd-0000-0000-0000-000000000002', 'Attività tre', 60, false);

-- Viaggio di gruppo (2 giorni) con due tappe, e un viaggio personale senza gruppo.
insert into public.itineraries (id, owner_id, title, days)
values ('dddddddd-0000-0000-0000-000000000101', tests.uid('owner'), 'Viaggio di gruppo', 2),
       ('dddddddd-0000-0000-0000-000000000102', tests.uid('owner'), 'Viaggio solo', 1);
insert into public.itinerary_items (id, itinerary_id, day_index, position, activity_id) values
  ('dddddddd-0000-0000-0000-000000000201', 'dddddddd-0000-0000-0000-000000000101', 0, 0, 'dddddddd-0000-0000-0000-000000000003'),
  ('dddddddd-0000-0000-0000-000000000202', 'dddddddd-0000-0000-0000-000000000101', 1, 0, 'dddddddd-0000-0000-0000-000000000003'),
  ('dddddddd-0000-0000-0000-000000000203', 'dddddddd-0000-0000-0000-000000000102', 0, 0, 'dddddddd-0000-0000-0000-000000000003');

select tests.authenticate_as('owner');
select set_config('tests.gid',
  public.create_group('Gruppo voti', 'dddddddd-0000-0000-0000-000000000101')::text, true);
reset role;

-- Il membro entra come farebbe accept_invite.
insert into public.group_members (group_id, user_id, role)
values (tests.gid(), tests.uid('member'), 'member');

----------------------------------------------------------------------------
-- Voti: itinerary_id riempito dal trigger
----------------------------------------------------------------------------
select tests.authenticate_as('member');
insert into public.item_votes (itinerary_item_id, user_id, value)
values ('dddddddd-0000-0000-0000-000000000201', tests.uid('member'), 1);
select is(
  (select itinerary_id from public.item_votes where itinerary_item_id = 'dddddddd-0000-0000-0000-000000000201'),
  'dddddddd-0000-0000-0000-000000000101'::uuid,
  'il voto prende itinerary_id dalla tappa'
);
select throws_ok(
  $$insert into public.item_votes (itinerary_item_id, user_id, value)
    values ('dddddddd-0000-0000-0000-000000000203', tests.uid('member'), 1)$$,
  '42501', null, 'non si vota una tappa di un viaggio senza gruppo'
);
reset role;

select tests.authenticate_as('other');
select is((select count(*)::int from public.item_votes), 0, 'un estraneo non vede i voti');
reset role;

----------------------------------------------------------------------------
-- Registro delle modifiche
----------------------------------------------------------------------------
select tests.authenticate_as('owner');
select lives_ok(
  $$insert into public.itinerary_changes (itinerary_id, actor_id, kind, payload)
    values ('dddddddd-0000-0000-0000-000000000101', tests.uid('owner'), 'day_added', '{"day": 3}')$$,
  'il proprietario scrive nel registro come sé'
);
select throws_ok(
  $$insert into public.itinerary_changes (itinerary_id, actor_id, kind, payload)
    values ('dddddddd-0000-0000-0000-000000000101', tests.uid('member'), 'day_added', '{"day": 3}')$$,
  '42501', null, 'non si scrive come un altro utente'
);
select throws_ok(
  $$update public.itinerary_changes set kind = 'day_removed'$$,
  '42501', null, 'nessun update dal client'
);
select throws_ok(
  $$delete from public.itinerary_changes$$,
  '42501', null, 'nessun delete dal client'
);
reset role;

select tests.authenticate_as('member');
select is((select count(*)::int from public.itinerary_changes), 1, 'il membro legge il registro del gruppo');
reset role;

select tests.authenticate_as('other');
select is((select count(*)::int from public.itinerary_changes), 0, 'un estraneo non legge il registro');
reset role;

select tests.authenticate_as('admin');
select is((select count(*)::int from public.itinerary_changes), 0, 'l''admin non legge il registro di un gruppo non suo');
reset role;

select tests.as_anon();
select throws_ok(
  $$select count(*) from public.itinerary_changes$$,
  '42501', null, 'l''anonimo non legge il registro'
);
reset role;

select tests.authenticate_as('guest');
select throws_ok(
  $$insert into public.itinerary_changes (itinerary_id, actor_id, kind, payload)
    values ('dddddddd-0000-0000-0000-000000000101', tests.uid('guest'), 'day_added', '{"day": 4}')$$,
  '42501', null, 'l''ospite non scrive nel registro'
);
reset role;

select throws_ok(
  $$update public.itinerary_changes set kind = 'day_removed'$$,
  'P0001', 'itinerary_changes_immutable', 'il registro è immutabile anche per postgres'
);
select throws_ok(
  $$delete from public.itinerary_changes$$,
  'P0001', 'itinerary_changes_immutable', 'il registro non si cancella neanche per postgres'
);

----------------------------------------------------------------------------
-- Proposte
----------------------------------------------------------------------------
select tests.authenticate_as('member');
select lives_ok(
  $$insert into public.itinerary_proposals (itinerary_id, proposed_by, activity_id, day_index)
    values ('dddddddd-0000-0000-0000-000000000101', tests.uid('member'), 'dddddddd-0000-0000-0000-000000000004', 1)$$,
  'il membro propone un''attività'
);
-- L'id lo genera il database (il client non lo sceglie): per i passi successivi gli si dà un valore noto.
reset role;
update public.itinerary_proposals set id = 'dddddddd-0000-0000-0000-000000000302'
where itinerary_id = 'dddddddd-0000-0000-0000-000000000101' and proposed_by = tests.uid('member')
  and activity_id = 'dddddddd-0000-0000-0000-000000000004' and day_index = 1;
select tests.authenticate_as('member');
select throws_ok(
  $$update public.itinerary_proposals set status = 'accepted'$$,
  '42501', null, 'il membro non cambia direttamente lo stato di una proposta'
);
reset role;

select tests.authenticate_as('guest');
select throws_ok(
  $$insert into public.itinerary_proposals (itinerary_id, proposed_by, activity_id, day_index)
    values ('dddddddd-0000-0000-0000-000000000101', tests.uid('guest'), 'dddddddd-0000-0000-0000-000000000004', 0)$$,
  '42501', null, 'l''ospite non propone'
);
reset role;

select tests.authenticate_as('other');
select throws_ok(
  $$insert into public.itinerary_proposals (itinerary_id, proposed_by, activity_id, day_index)
    values ('dddddddd-0000-0000-0000-000000000101', tests.uid('other'), 'dddddddd-0000-0000-0000-000000000004', 0)$$,
  '42501', null, 'un estraneo non propone'
);
select is((select count(*)::int from public.itinerary_proposals), 0, 'un estraneo non vede le proposte');
reset role;

-- Proposta di giorno fuori dal viaggio (scritta da postgres): accettarla deve fallire.
insert into public.itinerary_proposals (id, itinerary_id, proposed_by, activity_id, day_index)
values ('dddddddd-0000-0000-0000-000000000301', 'dddddddd-0000-0000-0000-000000000101',
  tests.uid('member'), 'dddddddd-0000-0000-0000-000000000004', 5);

select tests.authenticate_as('member');
select throws_ok(
  $$select public.decide_proposal('dddddddd-0000-0000-0000-000000000301', true)$$,
  'P0001', 'not_group_owner', 'solo il proprietario decide'
);
reset role;

select tests.authenticate_as('guest');
select throws_ok(
  $$select public.decide_proposal('dddddddd-0000-0000-0000-000000000301', true)$$,
  'P0001', 'guest_not_allowed', 'l''ospite non decide'
);
reset role;

select tests.authenticate_as('owner');
select throws_ok(
  $$select public.decide_proposal('dddddddd-0000-0000-0000-000000000301', true)$$,
  'P0001', 'day_out_of_range', 'accettare una proposta fuori dai giorni del viaggio fallisce'
);
select is((select count(*)::int from public.itinerary_proposals where status = 'pending'), 2,
  'il proprietario vede le proposte in attesa');
select lives_ok(
  $$select public.decide_proposal('dddddddd-0000-0000-0000-000000000302', true)$$,
  'il proprietario accetta la proposta'
);
select is(
  (select count(*)::int from public.itinerary_items
    where itinerary_id = 'dddddddd-0000-0000-0000-000000000101' and day_index = 1),
  2, 'la tappa accettata entra in fondo al giorno'
);
select is(
  (select count(*)::int from public.itinerary_changes where kind = 'proposal_accepted'),
  1, 'l''accettazione finisce nel registro'
);
select throws_ok(
  $$select public.decide_proposal('dddddddd-0000-0000-0000-000000000302', false)$$,
  'P0001', 'proposal_not_pending', 'una proposta si decide una sola volta'
);
select lives_ok(
  $$select public.decide_proposal('dddddddd-0000-0000-0000-000000000301', false)$$,
  'il proprietario rifiuta la proposta'
);
reset role;

-- Un'attività disattivata dopo la proposta non entra nel viaggio.
insert into public.itinerary_proposals (id, itinerary_id, proposed_by, activity_id, day_index)
values ('dddddddd-0000-0000-0000-000000000303', 'dddddddd-0000-0000-0000-000000000101', tests.uid('member'),
        'dddddddd-0000-0000-0000-000000000004', 0);
update public.activities set is_active = false where id = 'dddddddd-0000-0000-0000-000000000004';
select tests.authenticate_as('owner');
select throws_ok(
  $$select public.decide_proposal('dddddddd-0000-0000-0000-000000000303', true)$$,
  'P0001', 'activity_not_available', 'un''attività disattivata non si accetta'
);
reset role;
update public.activities set is_active = true where id = 'dddddddd-0000-0000-0000-000000000004';

-- Notifiche: il proponente riceve l'esito, gli altri non vedono nulla.
select tests.authenticate_as('member');
select is((select count(*)::int from public.notifications), 2, 'il proponente legge le proprie notifiche');
select is(
  (select count(*)::int from public.notifications where kind = 'proposal_accepted' and payload->>'title' = 'Attività due'),
  1, 'la notifica dell''accettazione porta titolo e giorno'
);
select throws_ok(
  $$insert into public.notifications (user_id, kind) values (tests.uid('member'), 'proposal_accepted')$$,
  '42501', null, 'il client non scrive notifiche'
);
select throws_ok(
  $$update public.notifications set kind = 'proposal_rejected'$$,
  '42501', null, 'si aggiorna solo read_at'
);
select lives_ok(
  $$update public.notifications set read_at = now() where read_at is null$$,
  'le notifiche si segnano come lette'
);
reset role;

select tests.authenticate_as('other');
select is((select count(*)::int from public.notifications), 0, 'un estraneo non vede le notifiche altrui');
reset role;

-- replace_group_stop e guardia sull'attività.
select tests.authenticate_as('member');
select throws_ok(
  $$select public.replace_group_stop('dddddddd-0000-0000-0000-000000000201', 'dddddddd-0000-0000-0000-000000000004')$$,
  'P0001', 'not_group_owner', 'solo il proprietario sostituisce una tappa'
);
select throws_ok(
  $$update public.itinerary_items set activity_id = 'dddddddd-0000-0000-0000-000000000004'
    where id = 'dddddddd-0000-0000-0000-000000000202'$$,
  'P0001', 'not_group_owner', 'il membro non cambia l''attività di una tappa di gruppo'
);
reset role;

select tests.authenticate_as('owner');
select throws_ok(
  $$select public.replace_group_stop('dddddddd-0000-0000-0000-000000000201', 'dddddddd-0000-0000-0000-000000000005')$$,
  'P0001', 'activity_not_available', 'un''attività non attiva non sostituisce la tappa'
);
select lives_ok(
  $$select public.replace_group_stop('dddddddd-0000-0000-0000-000000000201', 'dddddddd-0000-0000-0000-000000000004')$$,
  'il proprietario sostituisce la tappa'
);
select is(
  (select count(*)::int from public.item_votes where itinerary_item_id = 'dddddddd-0000-0000-0000-000000000201'),
  0, 'la sostituzione cancella i voti della tappa'
);
select is(
  (select count(*)::int from public.itinerary_changes
    where kind = 'stop_replaced' and payload->>'before' = 'Attività uno' and payload->>'after' = 'Attività due'),
  1, 'la sostituzione finisce nel registro con titolo prima e dopo'
);
select lives_ok(
  $$update public.itinerary_items set activity_id = 'dddddddd-0000-0000-0000-000000000004'
    where id = 'dddddddd-0000-0000-0000-000000000202'$$,
  'il proprietario cambia l''attività di una tappa di gruppo'
);
select lives_ok(
  $$update public.itinerary_items set activity_id = 'dddddddd-0000-0000-0000-000000000004'
    where id = 'dddddddd-0000-0000-0000-000000000203'$$,
  'un viaggio senza gruppo non ha guardie sull''attività'
);
reset role;

-- Realtime: nessun postgres_changes sulle tabelle del viaggio; broadcast privato solo ai membri.
select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime'
      and tablename in ('itinerary_items', 'item_votes', 'itinerary_changes', 'itinerary_proposals')),
  0, 'le tabelle del viaggio non sono nella publication realtime'
);
update public.itinerary_items set notes = 'realtime' where itinerary_id = 'dddddddd-0000-0000-0000-000000000101';
select set_config('realtime.topic', 'itinerary:dddddddd-0000-0000-0000-000000000101', true);
select tests.authenticate_as('owner');
select ok(
  (select count(*) from realtime.messages where topic = 'itinerary:dddddddd-0000-0000-0000-000000000101') > 0,
  'il proprietario del gruppo riceve il broadcast del viaggio'
);
reset role;
select tests.authenticate_as('other');
select is(
  (select count(*)::int from realtime.messages where topic = 'itinerary:dddddddd-0000-0000-0000-000000000101'),
  0, 'chi non è nel gruppo non riceve il broadcast del viaggio'
);
reset role;
-- Un membro di un altro gruppo, sottoscritto al proprio viaggio, non legge i messaggi di questo.
insert into public.itineraries (id, owner_id, title, days)
values ('dddddddd-0000-0000-0000-000000000103', tests.uid('other'), 'Altro gruppo', 1);
select tests.authenticate_as('other');
select public.create_group('Altro gruppo', 'dddddddd-0000-0000-0000-000000000103');
reset role;
select set_config('realtime.topic', 'itinerary:dddddddd-0000-0000-0000-000000000103', true);
select tests.authenticate_as('other');
select is(
  (select count(*)::int from realtime.messages where topic = 'itinerary:dddddddd-0000-0000-0000-000000000101'),
  0, 'sottoscritto al proprio viaggio, un membro di un altro gruppo non legge i messaggi di questo'
);
reset role;
-- Un viaggio senza gruppo non genera messaggi.
update public.itinerary_items set notes = 'solo' where itinerary_id = 'dddddddd-0000-0000-0000-000000000102';
select is(
  (select count(*)::int from realtime.messages where topic = 'itinerary:dddddddd-0000-0000-0000-000000000102'),
  0, 'un viaggio senza gruppo non genera messaggi realtime'
);
select set_config('realtime.topic', 'itinerary:non-un-uuid', true);
select tests.authenticate_as('owner');
select lives_ok(
  $$select count(*) from realtime.messages$$,
  'un topic malformato non fa fallire la policy'
);
select is(
  (select count(*)::int from realtime.messages where topic = 'itinerary:non-un-uuid'),
  0, 'un topic malformato non restituisce messaggi'
);
reset role;

-- Ex membro: esce dal gruppo e non legge più il registro né le proposte.
delete from public.group_members
where group_id = tests.gid() and user_id = tests.uid('member');
select tests.authenticate_as('member');
select is((select count(*)::int from public.itinerary_changes), 0, 'l''ex membro non legge il registro');
select is((select count(*)::int from public.itinerary_proposals), 0, 'l''ex membro non legge le proposte');
reset role;

select * from finish();
rollback;
