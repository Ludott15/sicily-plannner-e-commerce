-- Guide editoriali (passo 11.1): RLS di guides e guide_links.
-- Si coprono anonimo, utente, altro utente, ospite e admin. Nessun dato dal seed: tutto ha il
-- prefisso test- e viene annullato dal rollback finale.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('user');
select tests.create_user('other');
select tests.create_guest('guest');
select tests.create_user('admin', true);

insert into public.guides (id, slug, title_it, body_it, author_name, status, published_at)
values
  ('dddddddd-0000-0000-0000-000000000001', 'test-guida-pubblica', 'Pubblica', 'Testo.', 'Autore di prova', 'published', now()),
  ('dddddddd-0000-0000-0000-000000000002', 'test-guida-bozza', 'Bozza', 'Testo.', 'Autore di prova', 'draft', null);

insert into public.guide_links (guide_id, kind, target_id, position)
values
  ('dddddddd-0000-0000-0000-000000000001', 'place', 'aaaaaaaa-0000-0000-0000-0000000000b1', 0),
  ('dddddddd-0000-0000-0000-000000000002', 'place', 'aaaaaaaa-0000-0000-0000-0000000000b1', 0);

----------------------------------------------------------------------------
-- Vincoli della tabella (valgono anche per l'admin)
----------------------------------------------------------------------------
select throws_ok(
  $$insert into public.guides (slug, title_it, body_it, author_name, status) values ('test-senza-data', 'x', 'x', 'Autore', 'published')$$,
  '23514', null,
  'una guida pubblicata richiede la data di pubblicazione'
);
select throws_ok(
  $$insert into public.guides (slug, title_it, body_it, author_name) values ('Non Valido', 'x', 'x', 'Autore')$$,
  '23514', null,
  'slug delle guide in minuscolo con trattini'
);
select throws_ok(
  $$insert into public.guide_links (guide_id, kind, target_id) values ('dddddddd-0000-0000-0000-000000000001', 'event', gen_random_uuid())$$,
  '23514', null,
  'tipo di collegamento tra quelli ammessi'
);

----------------------------------------------------------------------------
-- ANONIMO
----------------------------------------------------------------------------
select tests.as_anon();

select isnt_empty($$select 1 from public.guides where slug = 'test-guida-pubblica'$$, 'anon: legge le guide pubblicate');
select is_empty($$select 1 from public.guides where slug = 'test-guida-bozza'$$, 'anon: la bozza non si vede');
select is_empty(
  $$select 1 from public.guide_links where guide_id = 'dddddddd-0000-0000-0000-000000000002'$$,
  'anon: i collegamenti della bozza non si vedono'
);
select isnt_empty(
  $$select 1 from public.guide_links where guide_id = 'dddddddd-0000-0000-0000-000000000001'$$,
  'anon: i collegamenti della guida pubblicata si vedono'
);
select throws_ok($$insert into public.guides (slug, title_it, body_it, author_name) values ('test-anon', 'x', 'x', 'Autore')$$, '42501', null, 'anon: non inserisce guide');
select throws_ok($$insert into public.guide_links (guide_id, kind, target_id) values ('dddddddd-0000-0000-0000-000000000001', 'place', gen_random_uuid())$$, '42501', null, 'anon: non inserisce collegamenti');
select throws_ok($$update public.guides set title_it = 'hack'$$, '42501', null, 'anon: non modifica guide');
select throws_ok($$delete from public.guides$$, '42501', null, 'anon: non cancella guide');

----------------------------------------------------------------------------
-- UTENTE, ALTRO UTENTE E OSPITE
----------------------------------------------------------------------------
select tests.authenticate_as('user');

select isnt_empty($$select 1 from public.guides where slug = 'test-guida-pubblica'$$, 'utente: legge le guide pubblicate');
select is_empty($$select 1 from public.guides where slug = 'test-guida-bozza'$$, 'utente: la bozza non si vede');
select is_empty(
  $$select 1 from public.guide_links where guide_id = 'dddddddd-0000-0000-0000-000000000002'$$,
  'utente: i collegamenti della bozza non si vedono'
);
select throws_ok($$insert into public.guides (slug, title_it, body_it, author_name) values ('test-utente', 'x', 'x', 'Autore')$$, '42501', null, 'utente: non inserisce guide');
update public.guides set title_it = 'hack' where slug = 'test-guida-pubblica';
delete from public.guides where slug = 'test-guida-bozza';
update public.guide_links set position = 9 where guide_id = 'dddddddd-0000-0000-0000-000000000001';
delete from public.guide_links where guide_id = 'dddddddd-0000-0000-0000-000000000001';

select tests.authenticate_as('other');

select is_empty($$select 1 from public.guides where slug = 'test-guida-bozza'$$, 'altro utente: la bozza non si vede');
select is_empty(
  $$select 1 from public.guide_links where guide_id = 'dddddddd-0000-0000-0000-000000000002'$$,
  'altro utente: i collegamenti della bozza non si vedono'
);

select tests.authenticate_as('guest');

select is_empty($$select 1 from public.guides where slug = 'test-guida-bozza'$$, 'ospite: la bozza non si vede');
select throws_ok($$insert into public.guides (slug, title_it, body_it, author_name) values ('test-ospite', 'x', 'x', 'Autore')$$, '42501', null, 'ospite: non inserisce guide');
update public.guides set title_it = 'hack' where slug = 'test-guida-pubblica';

select is(
  (select title_it from public.guides where slug = 'test-guida-pubblica'),
  'Pubblica',
  'utente e ospite: update delle guide senza effetto'
);
select isnt_empty(
  $$select 1 from public.guide_links where guide_id = 'dddddddd-0000-0000-0000-000000000001'$$,
  'utente e ospite: delete dei collegamenti senza effetto'
);

----------------------------------------------------------------------------
-- ADMIN
----------------------------------------------------------------------------
select tests.authenticate_as('admin');

select isnt_empty($$select 1 from public.guides where slug = 'test-guida-bozza'$$, 'admin: vede le bozze');
select lives_ok(
  $$insert into public.guides (id, slug, title_it, body_it, author_name) values ('dddddddd-0000-0000-0000-000000000003', 'test-admin', 'Nuova', 'Testo.', 'Autore di prova')$$,
  'admin: inserisce guide'
);
select lives_ok(
  $$update public.guides set status = 'published', published_at = now() where slug = 'test-admin'$$,
  'admin: pubblica una guida con data'
);
select lives_ok(
  $$insert into public.guide_links (guide_id, kind, target_id) values ('dddddddd-0000-0000-0000-000000000003', 'product', gen_random_uuid())$$,
  'admin: aggiunge collegamenti'
);
select is(
  (select count(*)::int from public.guide_links where guide_id = 'dddddddd-0000-0000-0000-000000000001'),
  1,
  'admin: legge i collegamenti'
);
select lives_ok($$delete from public.guides where slug = 'test-guida-bozza'$$, 'admin: cancella una guida');
select is(
  (select count(*)::int from public.guide_links where guide_id = 'dddddddd-0000-0000-0000-000000000002'),
  0,
  'cancellando una guida se ne vanno i suoi collegamenti (cascade)'
);

select * from finish();
rollback;
