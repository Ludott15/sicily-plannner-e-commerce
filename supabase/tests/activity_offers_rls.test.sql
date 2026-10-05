-- activity_offers: offerte dei partner per un'attività (schema 2e).
-- Lettura: offerte attive di attività attive per tutti; tutto per l'admin.
-- Scrittura: solo admin. Vincoli: partner nominabile, URL https, prodotto univoco per partner.
-- Ruoli: anonimo, utente, altro utente, ospite, admin.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_guest('guest');
select tests.create_user('admin', true);

insert into public.places (id, slug, name, province, lat, lng)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'test-offerte', 'Luogo', 'TP', 38.1, 12.8);
insert into public.activities (id, slug, place_id, title, duration_min, is_active)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'test-attiva', 'aaaaaaaa-0000-0000-0000-000000000001', 'Attiva', 120, false),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'test-inattiva', 'aaaaaaaa-0000-0000-0000-000000000001', 'Inattiva', 120, false);
insert into public.activity_interests (activity_id, interest_key, strength)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'sea', 2);
update public.activities set is_active = true where id = 'bbbbbbbb-0000-0000-0000-000000000001';

insert into public.activity_offers (id, activity_id, partner, partner_product_id, title, price_from_eur, affiliate_url, is_active)
values
  ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'getyourguide', 'O-1', 'Visibile', 40, 'https://www.getyourguide.com/o-1/', true),
  ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'viator', 'O-2', 'Offerta spenta', 50, 'https://www.viator.com/o-2/', false),
  ('dddddddd-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 'getyourguide', 'O-3', 'Attività inattiva', 30, 'https://www.getyourguide.com/o-3/', true);

----------------------------------------------------------------------------
-- LETTURA
----------------------------------------------------------------------------
select tests.as_anon();
select results_eq(
  $$select title from public.activity_offers where activity_id in ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002') order by title$$,
  $$values ('Visibile')$$,
  'anonimo: solo offerte attive di attività attive'
);
select tests.authenticate_as('alice');
select results_eq(
  $$select title from public.activity_offers where activity_id in ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002') order by title$$,
  $$values ('Visibile')$$,
  'utente: solo offerte attive di attività attive'
);
select tests.authenticate_as('guest');
select results_eq(
  $$select title from public.activity_offers where activity_id in ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002') order by title$$,
  $$values ('Visibile')$$,
  'ospite: solo offerte attive di attività attive'
);
select tests.authenticate_as('admin');
select results_eq(
  $$select count(*)::int from public.activity_offers where activity_id in ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002')$$,
  $$values (3)$$,
  'admin: vede anche offerte spente e di attività inattive'
);
reset role;

----------------------------------------------------------------------------
-- SCRITTURA: solo admin
----------------------------------------------------------------------------
select tests.as_anon();
select throws_ok(
  $$insert into public.activity_offers (activity_id, partner, partner_product_id, title, affiliate_url)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'getyourguide', 'X-1', 'x', 'https://x.example/')$$,
  '42501', null, 'anonimo: non crea offerte'
);
select tests.authenticate_as('alice');
select throws_ok(
  $$insert into public.activity_offers (activity_id, partner, partner_product_id, title, affiliate_url)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'getyourguide', 'X-1', 'x', 'https://x.example/')$$,
  '42501', null, 'utente: non crea offerte'
);
update public.activity_offers set affiliate_url = 'https://evil.example/' where id = 'dddddddd-0000-0000-0000-000000000001';
delete from public.activity_offers where id = 'dddddddd-0000-0000-0000-000000000001';
select tests.authenticate_as('bob');
update public.activity_offers set price_from_eur = 1 where id = 'dddddddd-0000-0000-0000-000000000001';
select tests.authenticate_as('guest');
update public.activity_offers set title = 'hack' where id = 'dddddddd-0000-0000-0000-000000000001';
reset role;
select results_eq(
  $$select title, price_from_eur, affiliate_url from public.activity_offers where id = 'dddddddd-0000-0000-0000-000000000001'$$,
  $$values ('Visibile', 40.00::numeric, 'https://www.getyourguide.com/o-1/')$$,
  'utente, altro utente e ospite: non modificano né eliminano offerte'
);

select tests.authenticate_as('admin');
select lives_ok(
  $$insert into public.activity_offers (id, activity_id, partner, partner_product_id, title, affiliate_url)
    values ('dddddddd-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000001', 'viator', 'O-4', 'Nuova', 'https://www.viator.com/o-4/')$$,
  'admin: crea un''offerta'
);
select lives_ok(
  $$update public.activity_offers set price_from_eur = 35 where id = 'dddddddd-0000-0000-0000-000000000004'$$,
  'admin: modifica un''offerta'
);
select lives_ok(
  $$delete from public.activity_offers where id = 'dddddddd-0000-0000-0000-000000000004'$$,
  'admin: elimina un''offerta'
);

----------------------------------------------------------------------------
-- VINCOLI
----------------------------------------------------------------------------
select throws_ok(
  $$insert into public.activity_offers (activity_id, partner, partner_product_id, title, affiliate_url)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'internal', 'I-1', 'x', 'https://x.example/')$$,
  '23514', null, 'nessuna offerta del partner internal'
);
select throws_ok(
  $$insert into public.activity_offers (activity_id, partner, partner_product_id, title, affiliate_url)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'viator', 'H-1', 'x', 'http://www.viator.com/')$$,
  '23514', null, 'URL solo https'
);
select throws_ok(
  $$insert into public.activity_offers (activity_id, partner, partner_product_id, title, affiliate_url)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'getyourguide', 'O-1', 'x', 'https://www.getyourguide.com/')$$,
  '23505', null, 'un prodotto del partner è una sola offerta'
);
select throws_ok(
  $$insert into public.activity_offers (activity_id, partner, partner_product_id, title, affiliate_url, currency)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'viator', 'C-1', 'x', 'https://www.viator.com/', 'eur')$$,
  '23514', null, 'valuta in tre lettere maiuscole'
);
reset role;

-- Eliminando un'offerta i suoi click restano, con offer_id a null (e l'attività).
-- (Eliminare l'attività insieme a click creati nella stessa transazione farebbe ricontrollare
-- a Postgres la chiave offer_id durante il set null: con click di transazioni passate no.)
insert into public.affiliate_clicks (activity_id, offer_id, partner, target_url, subid, context)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 'viator',
  'https://www.viator.com/o-2/?campaign=testsubid0001', 'testsubid0001', 'page');
delete from public.activity_offers where id = 'dddddddd-0000-0000-0000-000000000002';
select results_eq(
  $$select offer_id, activity_id from public.affiliate_clicks where subid = 'testsubid0001'$$,
  $$values (null::uuid, 'bbbbbbbb-0000-0000-0000-000000000001'::uuid)$$,
  'eliminando l''offerta il click resta, con l''attività e senza offerta'
);

-- Eliminando l'attività spariscono le sue offerte.
delete from public.activities where id = 'bbbbbbbb-0000-0000-0000-000000000002';
select is_empty(
  $$select 1 from public.activity_offers where id = 'dddddddd-0000-0000-0000-000000000003'$$,
  'eliminando l''attività si eliminano le sue offerte'
);

select * from finish();
rollback;
