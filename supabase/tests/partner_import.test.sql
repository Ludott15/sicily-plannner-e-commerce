-- Import dei partner: partner_import_runs e activity_tag_proposals sono leggibili solo
-- dall'admin, nessuno le scrive dal client.
-- Ruoli: anonimo, utente, admin. Tutto è annullato dal rollback finale.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('admin', true);

insert into public.places (id, slug, name, province, lat, lng)
values ('aaaaaaaa-0000-0000-0000-000000000031', 'test-import-partner', 'Luogo', 'TP', 38.1, 12.8);
insert into public.activities (id, slug, place_id, title, duration_min, is_active, embedded_hash)
values ('bbbbbbbb-0000-0000-0000-000000000031', 'test-import-attivita', 'aaaaaaaa-0000-0000-0000-000000000031', 'Attività importata', 120, false, repeat('a', 64));
insert into public.activity_tag_proposals (activity_id, interest_key, strength, model)
values ('bbbbbbbb-0000-0000-0000-000000000031', 'sea', 2, 'claude-haiku-5-5');
insert into public.partner_import_runs (id, partner, status, created_count)
values ('cccccccc-0000-0000-0000-000000000031', 'viator', 'ok', 1);

----------------------------------------------------------------------------
-- ANONIMO
----------------------------------------------------------------------------
select tests.as_anon();
select throws_ok(
  $$select count(*) from public.partner_import_runs$$,
  '42501', null, 'anonimo: non legge partner_import_runs'
);
select throws_ok(
  $$select count(*) from public.activity_tag_proposals$$,
  '42501', null, 'anonimo: non legge activity_tag_proposals'
);
select lives_ok(
  $$select id, slug, title, is_active, needs_review from public.activities$$,
  'anonimo: le colonne pubbliche di activities restano leggibili'
);

----------------------------------------------------------------------------
-- UTENTE (non admin)
----------------------------------------------------------------------------
select tests.authenticate_as('alice');
select results_eq(
  $$select count(*)::int from public.partner_import_runs$$,
  $$values (0)$$,
  'utente: non vede le righe di partner_import_runs'
);
select results_eq(
  $$select count(*)::int from public.activity_tag_proposals$$,
  $$values (0)$$,
  'utente: non vede le proposte di tag'
);
select throws_ok(
  $$insert into public.partner_import_runs (partner, status) values ('viator', 'ok')$$,
  '42501', null, 'utente: non scrive partner_import_runs'
);
select throws_ok(
  $$insert into public.activity_tag_proposals (activity_id, interest_key, strength, model)
    values ('bbbbbbbb-0000-0000-0000-000000000031', 'sea', 1, 'x')$$,
  '42501', null, 'utente: non scrive activity_tag_proposals'
);
reset role;

----------------------------------------------------------------------------
-- ADMIN
----------------------------------------------------------------------------
select tests.authenticate_as('admin');
select results_eq(
  $$select status from public.partner_import_runs where id = 'cccccccc-0000-0000-0000-000000000031'$$,
  $$values ('ok'::text)$$,
  'admin: legge il log degli import'
);
select results_eq(
  $$select interest_key from public.activity_tag_proposals where activity_id = 'bbbbbbbb-0000-0000-0000-000000000031'$$,
  $$values ('sea'::text)$$,
  'admin: legge i tag proposti'
);
select throws_ok(
  $$insert into public.partner_import_runs (partner, status) values ('viator', 'failed')$$,
  '42501', null, 'admin dal client: non scrive partner_import_runs'
);
select throws_ok(
  $$update public.partner_import_runs set status = 'failed'$$,
  '42501', null, 'admin dal client: non modifica partner_import_runs'
);
select throws_ok(
  $$delete from public.activity_tag_proposals$$,
  '42501', null, 'admin dal client: non cancella activity_tag_proposals'
);
reset role;

select * from finish();
rollback;
