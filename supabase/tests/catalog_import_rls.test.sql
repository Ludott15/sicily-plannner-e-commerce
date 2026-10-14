-- Import del catalogo: luoghi attivabili (is_active), fonti interne (activity_sources),
-- vincoli tra luoghi e attività attive, copertura dei luoghi inattivi (media_is_public).
-- Si coprono anonimo, utente, ospite e admin. Non dipende dal seed: tutto ciò che serve si
-- crea qui e sparisce con il rollback.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('user');
select tests.create_guest('guest');
select tests.create_user('admin', true);

-- Due media usabili (alt, autore, licenza, varianti): m1 copertina di un luogo attivo,
-- m2 copertina di un luogo inattivo.
insert into public.media (id, storage_path, width, height, alt_it, kind, source_type, author, license, variants_version) values
  ('dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001/master.jpg', 2000, 1500, 'Alt 1', 'photo', 'own', 'Autore', 'Tutti i diritti riservati', 1),
  ('dddddddd-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002/master.jpg', 2000, 1500, 'Alt 2', 'photo', 'own', 'Autore', 'Tutti i diritti riservati', 1);

-- Luoghi: P1 attivo (copertina m1), P2 inattivo da verificare (copertina m2), P3 e P4 attivi.
insert into public.places (id, slug, name, province, lat, lng, is_active, needs_review, cover_media_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000b1', 'test-luogo-attivo', 'Luogo attivo', 'PA', 38.10, 13.30, true, false, 'dddddddd-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-0000000000b2', 'test-luogo-inattivo', 'Luogo inattivo', 'PA', 38.10, 13.30, false, true, 'dddddddd-0000-0000-0000-000000000002'),
  ('aaaaaaaa-0000-0000-0000-0000000000b3', 'test-luogo-con-attivita', 'Luogo con attività', 'AG', 37.20, 13.50, true, false, null),
  ('aaaaaaaa-0000-0000-0000-0000000000b4', 'test-luogo-solo-bozze', 'Luogo solo bozze', 'AG', 37.20, 13.50, true, false, null);

-- Attività: create inattive, poi con i tag, poi attivate dove il luogo lo consente.
insert into public.activities (id, slug, place_id, title, duration_min) values
  ('bbbbbbbb-0000-0000-0000-0000000000c1', 'test-attiva', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'Attiva', 120),
  ('bbbbbbbb-0000-0000-0000-0000000000c2', 'test-bozza', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'Bozza', 60),
  ('bbbbbbbb-0000-0000-0000-0000000000c3', 'test-bozza-luogo-inattivo', 'aaaaaaaa-0000-0000-0000-0000000000b2', 'Bozza su luogo inattivo', 60),
  ('bbbbbbbb-0000-0000-0000-0000000000c4', 'test-attiva-su-luogo-attivo', 'aaaaaaaa-0000-0000-0000-0000000000b3', 'Attiva su luogo attivo', 90),
  ('bbbbbbbb-0000-0000-0000-0000000000c5', 'test-bozza-solo', 'aaaaaaaa-0000-0000-0000-0000000000b4', 'Bozza solo', 45);

insert into public.activity_interests (activity_id, interest_key, strength) values
  ('bbbbbbbb-0000-0000-0000-0000000000c1', 'sea', 2),
  ('bbbbbbbb-0000-0000-0000-0000000000c3', 'food_wine', 1),
  ('bbbbbbbb-0000-0000-0000-0000000000c4', 'nature_hiking', 2);

insert into public.activity_sources (activity_id, source_url, notes) values
  ('bbbbbbbb-0000-0000-0000-0000000000c1', 'https://example.com/fonte', 'Nota interna di prova');

set constraints all immediate;

update public.activities set is_active = true where id in (
  'bbbbbbbb-0000-0000-0000-0000000000c1', 'bbbbbbbb-0000-0000-0000-0000000000c4'
);

----------------------------------------------------------------------------
-- VINCOLI DI FORMATO (postgres)
----------------------------------------------------------------------------
select throws_ok(
  $$insert into public.places (slug, name, province, lat, lng, tagline_it) values ('test-tagline-lunga', 'x', 'PA', 38, 13, repeat('a', 91))$$,
  '23514', null, 'tagline: massimo 90 caratteri'
);
select throws_ok(
  $$insert into public.activity_sources (activity_id, source_url) values ('bbbbbbbb-0000-0000-0000-0000000000c2', 'ftp://esempio.it')$$,
  '23514', null, 'fonte: solo http o https'
);

----------------------------------------------------------------------------
-- ANONIMO
----------------------------------------------------------------------------
select tests.as_anon();

select results_eq(
  $$select slug from public.places where slug like 'test-%' order by slug$$,
  $$values ('test-luogo-attivo'), ('test-luogo-con-attivita'), ('test-luogo-solo-bozze')$$,
  'anon: vede solo i luoghi attivi'
);
select is_empty(
  $$select 1 from public.places where slug = 'test-luogo-inattivo'$$,
  'anon: non vede il luogo inattivo'
);
select throws_ok($$select 1 from public.activity_sources$$, '42501', null, 'anon: non legge le fonti');
select throws_ok(
  $$insert into public.activity_sources (activity_id, notes) values ('bbbbbbbb-0000-0000-0000-0000000000c2', 'x')$$,
  '42501', null, 'anon: non inserisce fonti'
);
select throws_ok($$update public.places set is_active = false$$, '42501', null, 'anon: non cambia lo stato dei luoghi');
select is(
  public.media_is_public('dddddddd-0000-0000-0000-000000000002'::uuid), false,
  'anon: la copertina di un luogo inattivo non è pubblica'
);
select is(
  public.media_is_public('dddddddd-0000-0000-0000-000000000001'::uuid), true,
  'anon: la copertina di un luogo attivo è pubblica'
);

----------------------------------------------------------------------------
-- UTENTE AUTENTICATO (non admin)
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('user');

select results_eq(
  $$select slug from public.places where slug like 'test-%' order by slug$$,
  $$values ('test-luogo-attivo'), ('test-luogo-con-attivita'), ('test-luogo-solo-bozze')$$,
  'utente: vede solo i luoghi attivi'
);
select is_empty(
  $$select 1 from public.places where slug = 'test-luogo-inattivo'$$,
  'utente: non vede il luogo inattivo'
);
select is_empty($$select 1 from public.activity_sources$$, 'utente: non vede le fonti');
select throws_ok(
  $$insert into public.activity_sources (activity_id, notes) values ('bbbbbbbb-0000-0000-0000-0000000000c2', 'x')$$,
  '42501', null, 'utente: non inserisce fonti'
);

update public.activity_sources set notes = 'hack' where activity_id = 'bbbbbbbb-0000-0000-0000-0000000000c1';
delete from public.activity_sources where activity_id = 'bbbbbbbb-0000-0000-0000-0000000000c1';
update public.places set name = 'hack' where slug = 'test-luogo-attivo';

reset role;
select is(
  (select notes from public.activity_sources where activity_id = 'bbbbbbbb-0000-0000-0000-0000000000c1'),
  'Nota interna di prova', 'utente: update e delete sulle fonti senza effetto'
);
select is(
  (select name from public.places where slug = 'test-luogo-attivo'),
  'Luogo attivo', 'utente: update dei luoghi senza effetto'
);

----------------------------------------------------------------------------
-- OSPITE (utente autenticato con is_anonymous): come l'utente
----------------------------------------------------------------------------
select tests.authenticate_as('guest');

select results_eq(
  $$select slug from public.places where slug like 'test-%' order by slug$$,
  $$values ('test-luogo-attivo'), ('test-luogo-con-attivita'), ('test-luogo-solo-bozze')$$,
  'ospite: vede solo i luoghi attivi'
);
select is_empty($$select 1 from public.activity_sources$$, 'ospite: non vede le fonti');
select throws_ok(
  $$insert into public.activity_sources (activity_id, notes) values ('bbbbbbbb-0000-0000-0000-0000000000c2', 'x')$$,
  '42501', null, 'ospite: non inserisce fonti'
);

----------------------------------------------------------------------------
-- ADMIN
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('admin');

select results_eq(
  $$select slug from public.places where slug like 'test-%' order by slug$$,
  $$values ('test-luogo-attivo'), ('test-luogo-con-attivita'), ('test-luogo-inattivo'), ('test-luogo-solo-bozze')$$,
  'admin: vede anche i luoghi inattivi'
);
select results_eq(
  $$select source_url, notes from public.activity_sources where activity_id = 'bbbbbbbb-0000-0000-0000-0000000000c1'$$,
  $$values ('https://example.com/fonte'::text, 'Nota interna di prova'::text)$$,
  'admin: legge le fonti'
);
select lives_ok(
  $$insert into public.activity_sources (activity_id, source_url, notes) values ('bbbbbbbb-0000-0000-0000-0000000000c2', 'https://example.com/bozza', 'Nota admin')$$,
  'admin: inserisce fonti'
);
select lives_ok(
  $$update public.activity_sources set notes = 'Nota aggiornata', updated_at = now() where activity_id = 'bbbbbbbb-0000-0000-0000-0000000000c1'$$,
  'admin: aggiorna le fonti'
);
select lives_ok(
  $$delete from public.activity_sources where activity_id = 'bbbbbbbb-0000-0000-0000-0000000000c2'$$,
  'admin: cancella le fonti'
);

-- Un luogo con attività attive non si disattiva.
select throws_ok(
  $$update public.places set is_active = false where slug = 'test-luogo-con-attivita'$$,
  'P0001', 'place_has_active_activities', 'admin: non disattiva un luogo con attività attive'
);
-- Un luogo con sole bozze si disattiva.
select lives_ok(
  $$update public.places set is_active = false where slug = 'test-luogo-solo-bozze'$$,
  'admin: disattiva un luogo con sole bozze'
);

-- Un'attività attiva non passa a un luogo inattivo, né si attiva in un luogo inattivo.
select throws_ok(
  $$update public.activities set place_id = 'aaaaaaaa-0000-0000-0000-0000000000b2' where id = 'bbbbbbbb-0000-0000-0000-0000000000c1'$$,
  'P0001', 'activity_place_inactive', 'admin: un''attività attiva non passa a un luogo inattivo'
);
select throws_ok(
  $$update public.activities set is_active = true where id = 'bbbbbbbb-0000-0000-0000-0000000000c3'$$,
  'P0001', 'activity_place_inactive', 'admin: non attiva un''attività in un luogo inattivo'
);

reset role;
select is(
  (select is_active from public.places where slug = 'test-luogo-solo-bozze'), false,
  'admin: il luogo con sole bozze è inattivo'
);
select is(
  (select notes from public.activity_sources where activity_id = 'bbbbbbbb-0000-0000-0000-0000000000c1'),
  'Nota aggiornata', 'admin: la fonte è aggiornata'
);
select is(
  (select count(*)::int from public.activity_sources where activity_id::text like 'bbbbbbbb-%'),
  1, 'admin: la fonte della bozza è stata cancellata, quella dell''attività resta'
);
select is(
  (select place_id from public.activities where id = 'bbbbbbbb-0000-0000-0000-0000000000c1'),
  'aaaaaaaa-0000-0000-0000-0000000000b1'::uuid, 'l''attività attiva resta nel suo luogo'
);
select is(
  (select is_active from public.activities where id = 'bbbbbbbb-0000-0000-0000-0000000000c3'), false,
  'la bozza nel luogo inattivo resta inattiva'
);

select * from finish();
rollback;
