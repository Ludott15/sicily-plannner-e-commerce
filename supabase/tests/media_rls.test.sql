-- Immagini del catalogo: media, image_authorizations, cover_media_id e storage.objects nel
-- bucket "media". Si coprono anonimo, utente, ospite, proprietario di un itinerario e admin.
-- Non dipende dal seed: tutto ciò che serve si crea qui e sparisce con il rollback.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('user');
select tests.create_user('owner');
select tests.create_guest('guest');
select tests.create_user('admin', true);

-- I trigger dello storage vietano le delete dirette in SQL: qui le si abilita per verificare
-- che a decidere sia la RLS.
select set_config('storage.allow_delete_query', 'true', true);

insert into public.image_authorizations (id, authority, reference, issued_on, valid_until, scope) values
  ('11111111-0000-0000-0000-000000000001', 'Parco di prova', 'Prot. 1', current_date - 10, current_date + 30, 'Foto del sito'),
  ('11111111-0000-0000-0000-000000000002', 'Parco di prova', 'Prot. 2', current_date - 400, current_date - 1, 'Foto del sito');

-- Media (id con prefisso: m1 pubblica, m2 senza alt, m3 attività inattiva, m4 bene culturale
-- autorizzato, m5 autorizzazione scaduta, m6 illustrazione di area, m7 itinerario pronto,
-- m8 itinerario privato, m9 non usata, m10 senza autore).
insert into public.media (id, storage_path, width, height, alt_it, kind, source_type, author, license, license_url,
                          source_url, variants_version, heritage_asset, authorization_id, created_by) values
  ('dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001/master.jpg', 2000, 1500, 'Alt 1', 'photo', 'licensed', 'Autore', 'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/', 'https://commons.wikimedia.org/wiki/File:Prova.jpg', 1, false, null, null),
  ('dddddddd-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002/master.jpg', 2000, 1500, null, 'photo', 'own', 'Autore', 'Tutti i diritti riservati', null, 'https://example.com/privato', 1, false, null, null),
  ('dddddddd-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000003/master.jpg', 2000, 1500, 'Alt 3', 'photo', 'own', 'Autore', 'Tutti i diritti riservati', null, null, 1, false, null, null),
  ('dddddddd-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000004/master.jpg', 2000, 1500, 'Alt 4', 'photo', 'own', 'Autore', 'Tutti i diritti riservati', null, null, 1, true, '11111111-0000-0000-0000-000000000001', null),
  ('dddddddd-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000005/master.jpg', 2000, 1500, 'Alt 5', 'photo', 'own', 'Autore', 'Tutti i diritti riservati', null, null, 1, true, '11111111-0000-0000-0000-000000000002', null),
  ('dddddddd-0000-0000-0000-000000000006', 'dddddddd-0000-0000-0000-000000000006/illustration.svg', 1600, 1000, 'Alt 6', 'illustration', 'illustration', null, null, null, null, 0, false, null, null),
  ('dddddddd-0000-0000-0000-000000000007', 'dddddddd-0000-0000-0000-000000000007/master.jpg', 2000, 1500, 'Alt 7', 'photo', 'partner', 'Partner', 'Licenza commerciale', null, null, 2, false, null, null),
  ('dddddddd-0000-0000-0000-000000000008', 'dddddddd-0000-0000-0000-000000000008/master.jpg', 2000, 1500, 'Alt 8', 'photo', 'own', 'Autore', 'Tutti i diritti riservati', null, null, 1, false, null, null),
  ('dddddddd-0000-0000-0000-000000000009', 'dddddddd-0000-0000-0000-000000000009/master.jpg', 2000, 1500, 'Alt 9', 'photo', 'own', 'Autore', 'Tutti i diritti riservati', null, null, 1, false, null, null),
  ('dddddddd-0000-0000-0000-000000000010', 'dddddddd-0000-0000-0000-000000000010/master.jpg', 2000, 1500, 'Alt 10', 'photo', 'licensed', null, 'CC0', null, null, 1, false, null, null);

insert into public.areas (id, slug, name_it, name_en, sort, cover_media_id)
values ('cccccccc-0000-0000-0000-0000000000a1', 'test-area-media', 'Area', 'Area', 900, 'dddddddd-0000-0000-0000-000000000006');
insert into public.places (id, slug, name, province, lat, lng, area_id, cover_media_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000b1', 'test-media-1', 'Luogo 1', 'PA', 38.1, 13.3, 'cccccccc-0000-0000-0000-0000000000a1', 'dddddddd-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-0000000000b2', 'test-media-2', 'Luogo 2', 'PA', 38.1, 13.3, null, 'dddddddd-0000-0000-0000-000000000002'),
  ('aaaaaaaa-0000-0000-0000-0000000000b4', 'test-media-4', 'Luogo 4', 'AG', 37.2, 13.5, null, 'dddddddd-0000-0000-0000-000000000004'),
  ('aaaaaaaa-0000-0000-0000-0000000000b5', 'test-media-5', 'Luogo 5', 'AG', 37.2, 13.5, null, 'dddddddd-0000-0000-0000-000000000005'),
  ('aaaaaaaa-0000-0000-0000-0000000000ba', 'test-media-10', 'Luogo 10', 'AG', 37.2, 13.5, null, 'dddddddd-0000-0000-0000-000000000010');
insert into public.activities (id, slug, place_id, title, duration_min, is_active, cover_media_id)
values ('bbbbbbbb-0000-0000-0000-0000000000c3', 'test-media-attivita', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'Attività inattiva', 60, false, 'dddddddd-0000-0000-0000-000000000003');
insert into public.itineraries (id, owner_id, title, slug, is_template, days, cover_media_id) values
  ('eeeeeeee-0000-0000-0000-000000000007', null, 'Pronto', 'test-media-pronto', true, 2, 'dddddddd-0000-0000-0000-000000000007'),
  ('eeeeeeee-0000-0000-0000-000000000008', tests.uid('owner'), 'Privato', null, false, 2, 'dddddddd-0000-0000-0000-000000000008');

-- File: per ogni media la variante corrente, l'originale e una variante di una versione
-- precedente; più un caricamento in attesa.
insert into storage.objects (bucket_id, name)
select 'media', m.id || '/v' || m.variants_version || '/4x5-800.avif' from public.media m where m.kind = 'photo' and m.id::text like 'dddddddd-%'
union all
select 'media', m.id || '/master.jpg' from public.media m where m.kind = 'photo' and m.id::text like 'dddddddd-%'
union all
select 'media', 'dddddddd-0000-0000-0000-000000000007/v1/4x5-800.avif'
union all
select 'media', 'dddddddd-0000-0000-0000-000000000006/illustration.svg'
union all
select 'media', 'incoming/aaaa.jpg';

----------------------------------------------------------------------------
-- Funzioni
----------------------------------------------------------------------------
select results_eq(
  $$select right(id::text, 2) from public.media where id::text like 'dddddddd-%' and public.media_is_usable(id) order by 1$$,
  $$values ('01'), ('03'), ('04'), ('06'), ('07'), ('08'), ('09')$$,
  'usabili: con alt, autore e licenza, autorizzazione valida se bene culturale'
);
select results_eq(
  $$select right(id::text, 2) from public.media where id::text like 'dddddddd-%' and public.media_is_public(id) order by 1$$,
  $$values ('01'), ('04'), ('06'), ('07')$$,
  'pubblici: usabili e copertina di luogo, area, attività attiva o itinerario pronto'
);
select is(
  (select credit_text from public.media where id = 'dddddddd-0000-0000-0000-000000000001'),
  'Foto: Autore, CC BY 4.0', 'credit_text di una foto'
);
select is(
  (select credit_text from public.media where id = 'dddddddd-0000-0000-0000-000000000006'),
  'Illustrazione di Isula', 'credit_text di un''illustrazione'
);
update public.media set modified = true where id = 'dddddddd-0000-0000-0000-000000000001';
select is(
  (select credit_text from public.media where id = 'dddddddd-0000-0000-0000-000000000001'),
  'Foto: Autore, CC BY 4.0 (modificata)', 'credit_text di una foto modificata'
);
select is(
  (select source_link from public.media where id = 'dddddddd-0000-0000-0000-000000000002'),
  null, 'source_link solo per le pagine di Wikimedia Commons'
);
select throws_ok(
  $$insert into public.media (storage_path, width, height, kind, source_type) values ('ffffffff-0000-0000-0000-000000000001/master.jpg', 10, 10, 'photo', 'illustration')$$,
  '23514', null, 'tipo e fonte coerenti (foto non illustration)'
);
select throws_ok(
  $$insert into public.media (storage_path, width, height, kind, source_type, authorization_id) values ('ffffffff-0000-0000-0000-000000000002/master.jpg', 10, 10, 'photo', 'own', '11111111-0000-0000-0000-000000000001')$$,
  '23514', null, 'autorizzazione solo per i beni culturali'
);
select throws_ok(
  $$insert into public.media (storage_path, width, height, kind, source_type) values ('../altro/master.jpg', 10, 10, 'photo', 'own')$$,
  '23514', null, 'storage_path nel formato {id}/master.ext'
);
select throws_ok(
  $$update public.places set is_home_hero = true where slug in ('test-media-1', 'test-media-2')$$,
  '23505', null, 'al massimo un luogo dell''hero'
);

----------------------------------------------------------------------------
-- ANONIMO
----------------------------------------------------------------------------
select tests.as_anon();

select results_eq(
  $$select right(id::text, 2) from public.media where id::text like 'dddddddd-%' order by 1$$,
  $$values ('01'), ('04'), ('06'), ('07')$$,
  'anon: vede solo i media pubblici'
);
select is(
  (select author from public.media where id = 'dddddddd-0000-0000-0000-000000000001'),
  'Autore', 'anon: legge la didascalia'
);
select is(
  (select source_link from public.media where id = 'dddddddd-0000-0000-0000-000000000001'),
  'https://commons.wikimedia.org/wiki/File:Prova.jpg', 'anon: legge source_link'
);
select throws_ok($$select source_url from public.media$$, '42501', null, 'anon: non legge source_url');
select throws_ok($$select heritage_asset from public.media$$, '42501', null, 'anon: non legge heritage_asset');
select throws_ok($$select authorization_id from public.media$$, '42501', null, 'anon: non legge authorization_id');
select throws_ok($$select created_by from public.media$$, '42501', null, 'anon: non legge created_by');
select throws_ok($$select 1 from public.image_authorizations$$, '42501', null, 'anon: non legge le autorizzazioni');
select throws_ok(
  $$insert into public.media (storage_path, width, height, kind, source_type) values ('ffffffff-0000-0000-0000-000000000003/master.jpg', 10, 10, 'photo', 'own')$$,
  '42501', null, 'anon: non inserisce media'
);
select throws_ok($$update public.media set alt_it = 'x'$$, '42501', null, 'anon: non modifica media');
select throws_ok($$delete from public.media$$, '42501', null, 'anon: non cancella media');
select throws_ok($$update public.places set cover_media_id = null$$, '42501', null, 'anon: non cambia le copertine');

select results_eq(
  $$select name from storage.objects where bucket_id = 'media' and name like 'dddddddd-%' order by name$$,
  $$values ('dddddddd-0000-0000-0000-000000000001/v1/4x5-800.avif'),
           ('dddddddd-0000-0000-0000-000000000004/v1/4x5-800.avif'),
           ('dddddddd-0000-0000-0000-000000000006/illustration.svg'),
           ('dddddddd-0000-0000-0000-000000000007/v2/4x5-800.avif')$$,
  'anon: dallo storage solo le varianti correnti dei media pubblici (niente originali né versioni vecchie)'
);
select is_empty($$select 1 from storage.objects where name like 'incoming/%'$$, 'anon: non vede i caricamenti in attesa');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('media', 'dddddddd-0000-0000-0000-000000000001/v1/4x5-480.avif')$$,
  '42501', null, 'anon: non carica file'
);
update storage.objects set name = name || '.x' where bucket_id = 'media';
delete from storage.objects where bucket_id = 'media';

----------------------------------------------------------------------------
-- UTENTE, OSPITE, PROPRIETARIO
----------------------------------------------------------------------------
select tests.authenticate_as('user');

select results_eq(
  $$select right(id::text, 2) from public.media where id::text like 'dddddddd-%' order by 1$$,
  $$values ('01'), ('04'), ('06'), ('07')$$,
  'utente: vede solo i media pubblici'
);
select throws_ok($$select source_url from public.media$$, '42501', null, 'utente: non legge source_url');
select throws_ok($$select 1 from public.image_authorizations$$, '42501', null, 'utente: non legge le autorizzazioni');
select throws_ok($$update public.media set alt_it = 'x'$$, '42501', null, 'utente: non modifica media');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('media', 'incoming/utente.jpg')$$,
  '42501', null, 'utente: non carica file'
);
select is_empty($$select 1 from storage.objects where name like '%/master.jpg'$$, 'utente: non legge gli originali');
update storage.objects set name = name || '.x' where bucket_id = 'media';
delete from storage.objects where bucket_id = 'media';

select tests.authenticate_as('owner');

select is_empty(
  $$select 1 from public.media where id = 'dddddddd-0000-0000-0000-000000000008'$$,
  'proprietario: la copertina del suo itinerario privato non è pubblica'
);
select throws_ok(
  $$update public.itineraries set cover_media_id = 'dddddddd-0000-0000-0000-000000000001' where id = 'eeeeeeee-0000-0000-0000-000000000008'$$,
  '42501', null, 'proprietario: non sceglie la copertina del suo itinerario (solo editoriale)'
);

select tests.authenticate_as('guest');

select results_eq(
  $$select right(id::text, 2) from public.media where id::text like 'dddddddd-%' order by 1$$,
  $$values ('01'), ('04'), ('06'), ('07')$$,
  'ospite: vede solo i media pubblici'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('media', 'incoming/ospite.jpg')$$,
  '42501', null, 'ospite: non carica file'
);
delete from storage.objects where bucket_id = 'media';

----------------------------------------------------------------------------
-- ADMIN
----------------------------------------------------------------------------
select tests.authenticate_as('admin');

select is(
  (select count(*)::int from storage.objects where bucket_id = 'media' and (name like 'dddddddd-%' or name like 'incoming/%')),
  21, 'utente, ospite e anon: update e delete dello storage senza effetto; l''admin vede tutti i file'
);
select results_eq(
  $$select count(*)::int from public.media where id::text like 'dddddddd-%'$$,
  $$values (10)$$,
  'admin: vede tutti i media'
);
select is(
  (select alt_it from public.media where id = 'dddddddd-0000-0000-0000-000000000001'),
  'Alt 1', 'anon e utente: update dei media senza effetto'
);
select throws_ok($$select source_url from public.media$$, '42501', null, 'admin via API: source_url solo dal server');
select throws_ok($$select 1 from public.image_authorizations$$, '42501', null, 'admin via API: autorizzazioni solo dal server');
select throws_ok(
  $$insert into public.media (storage_path, width, height, kind, source_type) values ('ffffffff-0000-0000-0000-000000000004/master.jpg', 10, 10, 'photo', 'own')$$,
  '42501', null, 'admin via API: i media li scrive solo il server'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('media', 'incoming/admin.jpg')$$,
  'admin: carica file nel bucket'
);
select lives_ok(
  $$delete from storage.objects where bucket_id = 'media' and name = 'incoming/aaaa.jpg'$$,
  'admin: cancella file'
);
select is_empty($$select 1 from storage.objects where name = 'incoming/aaaa.jpg'$$, 'admin: la cancellazione ha effetto');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('altro-bucket', 'x.jpg')$$,
  null, null, 'admin: le policy valgono solo per il bucket media'
);

----------------------------------------------------------------------------
-- La visibilità segue lo stato delle entità
----------------------------------------------------------------------------
reset role;
update public.activities set is_active = true where id = 'bbbbbbbb-0000-0000-0000-0000000000c3';
update public.itineraries set is_template = false, slug = null, owner_id = tests.uid('owner') where id = 'eeeeeeee-0000-0000-0000-000000000007';
update public.image_authorizations set valid_until = current_date - 1, issued_on = current_date - 30 where id = '11111111-0000-0000-0000-000000000001';
update public.places set cover_media_id = null where id = 'aaaaaaaa-0000-0000-0000-0000000000b1';
update public.places set cover_media_id = 'dddddddd-0000-0000-0000-000000000009' where id = 'aaaaaaaa-0000-0000-0000-0000000000b2';

select tests.as_anon();
select results_eq(
  $$select right(id::text, 2) from public.media where id::text like 'dddddddd-%' order by 1$$,
  $$values ('03'), ('06'), ('09')$$,
  'anon: attività attivata e nuova copertina compaiono; itinerario non più pronto, autorizzazione scaduta e copertina tolta spariscono'
);
select results_eq(
  $$select name from storage.objects where bucket_id = 'media' and name like 'dddddddd-%' order by name$$,
  $$values ('dddddddd-0000-0000-0000-000000000003/v1/4x5-800.avif'),
           ('dddddddd-0000-0000-0000-000000000006/illustration.svg'),
           ('dddddddd-0000-0000-0000-000000000009/v1/4x5-800.avif')$$,
  'anon: i file seguono la visibilità dei media'
);

select * from finish();
rollback;
