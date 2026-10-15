-- Tempi di guida tra aree (M4 parte 4): lettura pubblica, nessuna scrittura dal client,
-- vincoli di ordine della coppia e del range dei minuti, cascata alla cancellazione di un'area.
-- Le aree sono create nel test (int-…), senza dipendenza dal seed.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('user');
select tests.create_user('admin', true);

insert into public.areas (id, slug, name_it, name_en, sort) values
  ('cccccccc-0000-0000-0000-0000000000d1', 'int-dt-a', 'Int A', 'Int A', 931),
  ('cccccccc-0000-0000-0000-0000000000d2', 'int-dt-b', 'Int B', 'Int B', 932),
  ('cccccccc-0000-0000-0000-0000000000d3', 'int-dt-c', 'Int C', 'Int C', 933);
insert into public.area_drive_times (area_a_id, area_b_id, minutes) values
  ('cccccccc-0000-0000-0000-0000000000d1', 'cccccccc-0000-0000-0000-0000000000d2', 60),
  ('cccccccc-0000-0000-0000-0000000000d2', 'cccccccc-0000-0000-0000-0000000000d3', 40);

----------------------------------------------------------------------------
-- VINCOLI E CASCATA (come ruolo di default, proprietario delle tabelle)
----------------------------------------------------------------------------
select throws_ok(
  $$insert into public.area_drive_times (area_a_id, area_b_id, minutes) values ('cccccccc-0000-0000-0000-0000000000d2', 'cccccccc-0000-0000-0000-0000000000d1', 30)$$,
  '23514', null,
  'a < b: la coppia invertita non si scrive'
);
select throws_ok(
  $$insert into public.area_drive_times (area_a_id, area_b_id, minutes) values ('cccccccc-0000-0000-0000-0000000000d1', 'cccccccc-0000-0000-0000-0000000000d1', 30)$$,
  '23514', null,
  'a < b: un''area con sé stessa non si scrive'
);
select throws_ok(
  $$update public.area_drive_times set minutes = 0 where area_a_id = 'cccccccc-0000-0000-0000-0000000000d1'$$,
  '23514', null,
  'minuti: zero non vale'
);
select throws_ok(
  $$update public.area_drive_times set minutes = 601 where area_a_id = 'cccccccc-0000-0000-0000-0000000000d1'$$,
  '23514', null,
  'minuti: oltre 600 non vale'
);

select lives_ok(
  $$delete from public.areas where slug = 'int-dt-c'$$,
  'cancellazione di un''area di prova'
);
select is(
  (select count(*)::int from public.area_drive_times where area_b_id = 'cccccccc-0000-0000-0000-0000000000d3'),
  0,
  'cascata: cancellando l''area si cancellano le sue coppie'
);
select is(
  (select count(*)::int from public.area_drive_times where area_a_id = 'cccccccc-0000-0000-0000-0000000000d1'),
  1,
  'cascata: le altre coppie restano'
);

----------------------------------------------------------------------------
-- ANONIMO
----------------------------------------------------------------------------
select tests.as_anon();

select isnt_empty(
  $$select 1 from public.area_drive_times where area_a_id = 'cccccccc-0000-0000-0000-0000000000d1' and minutes = 60$$,
  'anon: legge i tempi di guida'
);
select throws_ok(
  $$insert into public.area_drive_times (area_a_id, area_b_id, minutes) values ('cccccccc-0000-0000-0000-0000000000d1', 'cccccccc-0000-0000-0000-0000000000d2', 90)$$,
  '42501', null,
  'anon: non inserisce'
);
select throws_ok($$update public.area_drive_times set minutes = 90$$, '42501', null, 'anon: non modifica');
select throws_ok($$delete from public.area_drive_times$$, '42501', null, 'anon: non cancella');

----------------------------------------------------------------------------
-- UTENTE
----------------------------------------------------------------------------
select tests.authenticate_as('user');

select isnt_empty(
  $$select 1 from public.area_drive_times where minutes = 60$$,
  'utente: legge i tempi di guida'
);
select throws_ok(
  $$insert into public.area_drive_times (area_a_id, area_b_id, minutes) values ('cccccccc-0000-0000-0000-0000000000d1', 'cccccccc-0000-0000-0000-0000000000d2', 90)$$,
  '42501', null,
  'utente: non inserisce'
);
select throws_ok($$update public.area_drive_times set minutes = 90$$, '42501', null, 'utente: non modifica');
select throws_ok($$delete from public.area_drive_times$$, '42501', null, 'utente: non cancella');

----------------------------------------------------------------------------
-- ADMIN VIA CLIENT (la scrittura passa da dbAdmin, non dal client)
----------------------------------------------------------------------------
select tests.authenticate_as('admin');

select isnt_empty(
  $$select 1 from public.area_drive_times where minutes = 60$$,
  'admin: legge i tempi di guida'
);
select throws_ok(
  $$insert into public.area_drive_times (area_a_id, area_b_id, minutes) values ('cccccccc-0000-0000-0000-0000000000d1', 'cccccccc-0000-0000-0000-0000000000d2', 90)$$,
  '42501', null,
  'admin via client: non inserisce'
);
select throws_ok($$update public.area_drive_times set minutes = 90$$, '42501', null, 'admin via client: non modifica');
select throws_ok($$delete from public.area_drive_times$$, '42501', null, 'admin via client: non cancella');

select * from finish();
rollback;
