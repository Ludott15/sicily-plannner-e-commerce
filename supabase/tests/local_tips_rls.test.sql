-- Consigli locali: local_tip_authors, local_tips, viste public_local_tips e
-- local_tips_due_for_review. Tabelle solo admin; pubblico solo dalla vista, con i consigli
-- attivi verificati negli ultimi 12 mesi. Ruoli: anonimo, utente, altro utente, ospite, admin.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_guest('guest');
select tests.create_user('admin', true);

insert into public.places (id, slug, name, province, lat, lng)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'test-tips', 'Luogo', 'SR', 37, 15);
insert into public.activities (id, slug, place_id, title, duration_min, is_active)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'test-tip-attiva', 'aaaaaaaa-0000-0000-0000-000000000001', 'Attiva', 60, false),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'test-tip-inattiva', 'aaaaaaaa-0000-0000-0000-000000000001', 'Inattiva', 60, false);
insert into public.activity_interests (activity_id, interest_key, strength)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'sea', 1);
update public.activities set is_active = true where id = 'bbbbbbbb-0000-0000-0000-000000000001';

insert into public.local_tip_authors (id, kind, display_name, bio, consent_at, is_active)
values
  ('cccccccc-0000-0000-0000-000000000001', 'editorial', 'Redazione di test', 'Bio privata', null, true),
  ('cccccccc-0000-0000-0000-000000000002', 'person', 'Persona di test', 'Bio privata', now(), true),
  ('cccccccc-0000-0000-0000-000000000003', 'editorial', 'Autore spento', null, null, false);

insert into public.local_tips (id, author_id, activity_id, place_id, body, author_relation, verified_at, is_active)
values
  -- 1 visibile (attività), 2 visibile (luogo, persona), 3 scaduto, 4 in scadenza, 5 spento,
  -- 6 di autore spento, 7 su attività inattiva
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', null, 'Visibile attività', null, current_date - 30, true),
  ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000002', null, 'aaaaaaaa-0000-0000-0000-000000000001', 'Visibile luogo', 'ci va ogni estate', current_date - 60, true),
  ('dddddddd-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001', 'Scaduto', null, current_date - 400, true),
  ('dddddddd-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001', 'In scadenza', null, (current_date - interval '12 months' + interval '10 days')::date, true),
  ('dddddddd-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001', 'Spento', null, current_date, false),
  ('dddddddd-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-000000000003', null, 'aaaaaaaa-0000-0000-0000-000000000001', 'Autore spento', null, current_date, true),
  ('dddddddd-0000-0000-0000-000000000007', 'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', null, 'Attività inattiva', null, current_date, true);

create function tests.visible() returns setof text language sql stable as $$
  select body from public.public_local_tips
  where place_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     or activity_id in ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002')
  order by body
$$;
grant execute on function tests.visible() to anon, authenticated;

----------------------------------------------------------------------------
-- VISTA PUBBLICA
----------------------------------------------------------------------------
select tests.as_anon();
select results_eq(
  $$select * from tests.visible()$$,
  $$values ('In scadenza'), ('Visibile attività'), ('Visibile luogo')$$,
  'anonimo: solo consigli attivi, di autori attivi, verificati negli ultimi 12 mesi, non di attività inattive'
);
select tests.authenticate_as('alice');
select results_eq($$select * from tests.visible()$$, $$values ('In scadenza'), ('Visibile attività'), ('Visibile luogo')$$, 'utente: stessa vista');
select tests.authenticate_as('guest');
select results_eq($$select * from tests.visible()$$, $$values ('In scadenza'), ('Visibile attività'), ('Visibile luogo')$$, 'ospite: stessa vista');
select tests.authenticate_as('admin');
select results_eq($$select * from tests.visible()$$, $$values ('In scadenza'), ('Visibile attività'), ('Visibile luogo')$$, 'admin: la vista pubblica non mostra di più');
reset role;

select results_eq(
  $$select author_kind::text, author_name, author_relation from public.public_local_tips where id = 'dddddddd-0000-0000-0000-000000000002'$$,
  $$values ('person', 'Persona di test', 'ci va ogni estate')$$,
  'vista: tipo, nome e relazione dell''autore'
);
select is_empty(
  $$select 1 from information_schema.columns where table_schema = 'public' and table_name = 'public_local_tips'
    and column_name in ('author_id', 'bio', 'profile_id', 'consent_at', 'is_active')$$,
  'vista: niente id, bio, profilo né consenso dell''autore'
);

----------------------------------------------------------------------------
-- TABELLE: solo admin
----------------------------------------------------------------------------
select tests.as_anon();
select throws_ok($$select * from public.local_tips$$, '42501', null, 'anonimo: non legge local_tips');
select throws_ok($$select * from public.local_tip_authors$$, '42501', null, 'anonimo: non legge local_tip_authors');
select throws_ok($$select * from public.local_tips_due_for_review$$, '42501', null, 'anonimo: non legge la coda');
select tests.authenticate_as('alice');
select is_empty($$select 1 from public.local_tips$$, 'utente: nessun consiglio dalla tabella');
select is_empty($$select 1 from public.local_tip_authors$$, 'utente: nessun autore dalla tabella');
select is_empty($$select 1 from public.local_tips_due_for_review$$, 'utente: coda vuota');
select throws_ok(
  $$insert into public.local_tips (author_id, place_id, body, verified_at)
    values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Mio', current_date)$$,
  '42501', null, 'utente: non scrive consigli'
);
update public.local_tips set body = 'hack' where id = 'dddddddd-0000-0000-0000-000000000001';
select tests.authenticate_as('bob');
delete from public.local_tips where id = 'dddddddd-0000-0000-0000-000000000001';
select tests.authenticate_as('guest');
select throws_ok(
  $$insert into public.local_tip_authors (kind, display_name) values ('editorial', 'Finto')$$,
  '42501', null, 'ospite: non crea autori'
);
reset role;
select is(
  (select body from public.local_tips where id = 'dddddddd-0000-0000-0000-000000000001'),
  'Visibile attività',
  'utente e altro utente: non modificano né eliminano consigli'
);

select tests.authenticate_as('admin');
select results_eq(
  $$select body from public.local_tips_due_for_review where place_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by body$$,
  $$values ('In scadenza'), ('Scaduto')$$,
  'admin: la coda "Da riverificare" ha i consigli scaduti e quelli che scadono entro 30 giorni'
);
select lives_ok(
  $$update public.local_tips set verified_at = current_date where id = 'dddddddd-0000-0000-0000-000000000004'$$,
  'admin: riverifica un consiglio'
);
select is_empty(
  $$select 1 from public.local_tips_due_for_review where id = 'dddddddd-0000-0000-0000-000000000004'$$,
  'riverificato: esce dalla coda'
);
select lives_ok(
  $$insert into public.local_tips (author_id, place_id, body, verified_at)
    values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Nuovo', current_date)$$,
  'admin: crea un consiglio'
);
reset role;

----------------------------------------------------------------------------
-- REGOLE
----------------------------------------------------------------------------
select throws_ok(
  $$insert into public.local_tips (author_id, place_id, body, verified_at)
    values ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Senza relazione', current_date)$$,
  'P0001', 'person_tip_without_relation', 'una persona firma solo con la relazione con il luogo'
);
select throws_ok(
  $$update public.local_tip_authors set kind = 'person', consent_at = now() where id = 'cccccccc-0000-0000-0000-000000000001'$$,
  'P0001', 'person_tip_without_relation', 'un autore con consigli senza relazione non diventa persona'
);
select throws_ok(
  $$insert into public.local_tip_authors (kind, display_name) values ('person', 'Senza consenso')$$,
  '23514', null, 'una persona firma solo con il consenso'
);
select throws_ok(
  $$insert into public.local_tips (author_id, body, verified_at) values ('cccccccc-0000-0000-0000-000000000001', 'Senza luogo', current_date)$$,
  '23514', null, 'un consiglio è di un''attività o di un luogo'
);
select throws_ok(
  format($$insert into public.local_tips (author_id, place_id, body, verified_at) values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', %L, current_date)$$, repeat('a', 281)),
  '23514', null, 'al massimo 280 caratteri'
);

select * from finish();
rollback;
