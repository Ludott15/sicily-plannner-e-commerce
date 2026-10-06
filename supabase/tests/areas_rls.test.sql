-- Aree di viaggio (M4 parte 3): areas e places.area_id.
-- Lettura pubblica, scrittura solo admin. Si coprono anonimo, utente, ospite e admin.
-- Le otto aree vengono dalla migrazione, non dal seed.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('user');
select tests.create_guest('guest');
select tests.create_user('admin', true);

insert into public.areas (id, slug, name_it, name_en, sort)
values ('cccccccc-0000-0000-0000-000000000001', 'test-area', 'Area di prova', 'Test area', 900);
insert into public.places (id, slug, name, province, lat, lng, area_id)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'test-luogo-area', 'Luogo', 'PA', 38.1, 13.3, 'cccccccc-0000-0000-0000-000000000001');

select results_eq(
  $$select slug from public.areas where slug not like 'test-%' order by sort$$,
  $$values ('palermo'), ('costa-nord-madonie'), ('ovest'), ('agrigentino'), ('interno'), ('etna-costa-ionica'), ('siracusano'), ('barocco-ibleo')$$,
  'migrazione: le otto aree in ordine'
);

----------------------------------------------------------------------------
-- ANONIMO
----------------------------------------------------------------------------
select tests.as_anon();

select isnt_empty($$select 1 from public.areas where slug = 'test-area'$$, 'anon: legge le aree');
select is(
  (select area_id::text from public.places where slug = 'test-luogo-area'),
  'cccccccc-0000-0000-0000-000000000001',
  'anon: legge l''area di un luogo'
);
select throws_ok($$insert into public.areas (slug, name_it, name_en) values ('x', 'x', 'x')$$, '42501', null, 'anon: non inserisce aree');
select throws_ok($$update public.areas set name_it = 'hack'$$, '42501', null, 'anon: non modifica aree');
select throws_ok($$delete from public.areas$$, '42501', null, 'anon: non cancella aree');
select throws_ok($$update public.places set area_id = null$$, '42501', null, 'anon: non cambia l''area dei luoghi');

----------------------------------------------------------------------------
-- UTENTE E OSPITE
----------------------------------------------------------------------------
select tests.authenticate_as('user');

select isnt_empty($$select 1 from public.areas where slug = 'test-area'$$, 'utente: legge le aree');
select throws_ok($$insert into public.areas (slug, name_it, name_en) values ('x', 'x', 'x')$$, '42501', null, 'utente: non inserisce aree');
update public.areas set name_it = 'hack' where slug = 'test-area';
delete from public.areas where slug = 'test-area';
update public.places set area_id = null where slug = 'test-luogo-area';

select tests.authenticate_as('guest');

select throws_ok($$insert into public.areas (slug, name_it, name_en) values ('y', 'y', 'y')$$, '42501', null, 'ospite: non inserisce aree');
update public.areas set name_it = 'hack' where slug = 'test-area';
update public.places set area_id = null where slug = 'test-luogo-area';

select tests.authenticate_as('admin');

select is((select name_it from public.areas where slug = 'test-area'), 'Area di prova', 'utente e ospite: update delle aree senza effetto');
select isnt_empty($$select 1 from public.areas where slug = 'test-area'$$, 'utente: delete delle aree senza effetto');
select is(
  (select area_id::text from public.places where slug = 'test-luogo-area'),
  'cccccccc-0000-0000-0000-000000000001',
  'utente e ospite: l''area del luogo non cambia'
);

----------------------------------------------------------------------------
-- ADMIN
----------------------------------------------------------------------------
select lives_ok($$insert into public.areas (slug, name_it, name_en, sort) values ('test-nuova', 'Nuova', 'New', 901)$$, 'admin: inserisce aree');
select lives_ok($$update public.areas set name_it = 'Rinominata' where slug = 'test-nuova'$$, 'admin: modifica aree');
select is((select name_it from public.areas where slug = 'test-nuova'), 'Rinominata', 'admin: la modifica ha effetto');
select lives_ok(
  $$update public.places set area_id = (select id from public.areas where slug = 'test-nuova') where slug = 'test-luogo-area'$$,
  'admin: assegna l''area a un luogo'
);
select is(
  (select a.slug from public.places p join public.areas a on a.id = p.area_id where p.slug = 'test-luogo-area'),
  'test-nuova',
  'admin: l''assegnazione ha effetto'
);
select throws_ok(
  $$delete from public.areas where slug = 'test-nuova'$$,
  '23503', null,
  'un''area con luoghi non si cancella (restrict)'
);
select lives_ok($$delete from public.areas where slug = 'test-area'$$, 'admin: cancella un''area senza luoghi');
select throws_ok(
  $$insert into public.areas (slug, name_it, name_en) values ('Non Valido', 'x', 'x')$$,
  '23514', null,
  'slug delle aree in minuscolo con trattini'
);

select * from finish();
rollback;
