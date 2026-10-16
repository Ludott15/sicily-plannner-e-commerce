-- Catalogo dello shop (passo 7.1): fornitori, produttori, prodotti, galleria, collegamenti e box.
-- Ruoli: anonimo, utente (bob, non admin), admin. Nessun test dipende dal seed:
-- tutti i dati sono creati qui e annullati dal rollback finale.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('bob');
select tests.create_user('admin', true);

-- Dati preparati come postgres (come fa il server con dbAdmin).
insert into public.suppliers (id, name, kind, contact_email, is_active)
values
  ('a0000000-0000-0000-0000-000000000001', 'Fornitore di prova', 'manual', 'fornitore@example.com', true),
  ('a0000000-0000-0000-0000-000000000002', 'Fornitore spento', 'manual', 'spento@example.com', false);

insert into public.producers (id, slug, name, email, story_it, is_public, is_active, vat_number, address)
values
  ('b0000000-0000-0000-0000-000000000001', 'test-produttore', 'Produttore di prova', 'marchio@example.com', 'Storia di prova', true, true, 'IT00000000000', 'Via di prova 1'),
  ('b0000000-0000-0000-0000-000000000002', 'test-privato', 'Produttore privato', 'privato@example.com', null, false, true, 'IT11111111111', 'Via privata 2');

insert into public.places (id, slug, name, province, lat, lng, is_active)
values
  ('c0000000-0000-0000-0000-000000000001', 'test-luogo', 'Luogo di prova', 'PA', 38.0, 13.0, true),
  ('c0000000-0000-0000-0000-000000000002', 'test-luogo-chiuso', 'Luogo chiuso', 'PA', 38.0, 13.0, false);

insert into public.products (id, slug, producer_id, supplier_id, supplier_sku, title, category, format_label, ingredients_it, price_cents, cost_cents, vat_rate, weight_g, allergens, allergens_declared, is_active, is_box)
values
  ('d0000000-0000-0000-0000-000000000001', 'test-crema', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'SKU-1', 'Crema di prova', 'dolci', 'vasetto 190 g', 'Pistacchi, zucchero', 1200, 700, 10, 200, '{milk,nuts}', true, true, false),
  ('d0000000-0000-0000-0000-000000000002', 'test-bozza', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'SKU-2', 'Bozza', 'olio', 'bottiglia 500 ml', 'Olio extravergine', 900, 400, 4, 150, '{}', true, false, false),
  ('d0000000-0000-0000-0000-000000000003', 'test-fornitore-spento', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'SKU-3', 'Prodotto con fornitore spento', 'vino', 'bottiglia 750 ml', 'Uva', 1500, 800, 22, 750, '{sulphites}', true, true, false),
  ('d0000000-0000-0000-0000-000000000004', 'test-privato', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'SKU-4', 'Prodotto di produttore privato', 'pasta', 'confezione 500 g', 'Semola', 500, 200, 4, 500, '{gluten}', true, true, false),
  ('d0000000-0000-0000-0000-000000000005', 'test-box', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'SKU-5', 'Box di prova', 'box', null, null, 2500, 1500, 10, 1000, '{}', true, true, true);

insert into public.box_items (box_id, product_id, quantity)
values ('d0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000001', 2);

insert into public.product_links (product_id, kind, target_id, position)
values
  ('d0000000-0000-0000-0000-000000000001', 'place', 'c0000000-0000-0000-0000-000000000001', 0),
  ('d0000000-0000-0000-0000-000000000001', 'place', 'c0000000-0000-0000-0000-000000000002', 1);

-- Media (come in media_rls.test.sql): alt testo, foto propria, versione 1.
insert into public.media (id, storage_path, width, height, alt_it, kind, source_type, author, license, variants_version, heritage_asset)
values
  ('ee000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000001/master.jpg', 2000, 1500, 'Alt 1', 'photo', 'own', 'Autore', 'Tutti i diritti riservati', 1, false),
  ('ee000000-0000-0000-0000-000000000002', 'ee000000-0000-0000-0000-000000000002/master.jpg', 2000, 1500, 'Alt 2', 'photo', 'own', 'Autore', 'Tutti i diritti riservati', 1, false),
  ('ee000000-0000-0000-0000-000000000003', 'ee000000-0000-0000-0000-000000000003/master.jpg', 2000, 1500, 'Alt 3', 'photo', 'own', 'Autore', 'Tutti i diritti riservati', 1, false),
  ('ee000000-0000-0000-0000-000000000004', 'ee000000-0000-0000-0000-000000000004/master.jpg', 2000, 1500, 'Alt 4', 'photo', 'own', 'Autore', 'Tutti i diritti riservati', 1, false);

-- m1: copertina di un prodotto vendibile. m3: galleria di un prodotto vendibile.
-- m2: galleria di un prodotto di produttore privato. m4: copertina di un prodotto inattivo.
update public.products set cover_media_id = 'ee000000-0000-0000-0000-000000000001' where slug = 'test-crema';
update public.products set cover_media_id = 'ee000000-0000-0000-0000-000000000004' where slug = 'test-bozza';
insert into public.product_media (product_id, media_id, position)
values
  ('d0000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000001', 0),
  ('d0000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000003', 1),
  ('d0000000-0000-0000-0000-000000000004', 'ee000000-0000-0000-0000-000000000002', 0);

----------------------------------------------------------------------------
-- VINCOLI
----------------------------------------------------------------------------
select throws_ok(
  $$insert into public.products (slug, producer_id, supplier_id, supplier_sku, title, category, price_cents, vat_rate, weight_g) values ('test-iva', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'SKU-X1', 'x', 'dolci', 100, 5, 10)$$,
  '23514', null, 'prodotti: l''aliquota IVA è 4, 10 o 22'
);
select throws_ok(
  $$insert into public.products (slug, producer_id, supplier_id, supplier_sku, title, category, price_cents, vat_rate, weight_g, allergens) values ('test-allergeni', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'SKU-X2', 'x', 'dolci', 100, 4, 10, '{latte}')$$,
  '23514', null, 'prodotti: solo gli allergeni dell''elenco UE'
);
select throws_ok(
  $$insert into public.products (slug, producer_id, supplier_id, supplier_sku, title, category, price_cents, vat_rate, weight_g) values ('test-categoria', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'SKU-X3', 'x', 'bevande', 100, 4, 10)$$,
  '23514', null, 'prodotti: categoria dell''elenco chiuso'
);
select throws_ok(
  $$insert into public.products (slug, producer_id, supplier_id, supplier_sku, title, category, price_cents, cost_cents, vat_rate, weight_g) values ('test-costo', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'SKU-X4', 'x', 'dolci', 100, -1, 4, 10)$$,
  '23514', null, 'prodotti: il costo non è negativo'
);
select throws_ok(
  $$insert into public.products (slug, producer_id, supplier_id, supplier_sku, title, category, price_cents, vat_rate, weight_g) values ('test-sku', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'SKU-1', 'x', 'dolci', 100, 4, 10)$$,
  '23505', null, 'prodotti: codice del fornitore univoco per fornitore'
);
select throws_ok(
  $$insert into public.products (slug, producer_id, supplier_id, supplier_sku, title, category, price_cents, vat_rate, weight_g, format_label, ingredients_it, allergens_declared, is_active) values ('test-attivo-senza-allergeni', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'SKU-X5', 'x', 'dolci', 100, 4, 10, 'vasetto', 'zucchero', false, true)$$,
  '23514', null, 'prodotti: un prodotto attivo richiede gli allergeni dichiarati'
);
select throws_ok(
  $$insert into public.products (slug, producer_id, supplier_id, supplier_sku, title, category, price_cents, vat_rate, format_label, ingredients_it, allergens_declared, is_active) values ('test-attivo-senza-etichetta', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'SKU-X6', 'x', 'dolci', 100, 4, 'vasetto', null, true, true)$$,
  '23514', null, 'prodotti: un prodotto attivo non box richiede ingredienti e formato'
);
select throws_ok(
  $$insert into public.product_links (product_id, kind, target_id) values ('d0000000-0000-0000-0000-000000000002', 'place', '00000000-0000-0000-0000-00000000dead')$$,
  'P0001', 'product_link_target_missing', 'collegamenti: il luogo deve esistere'
);
select throws_ok(
  $$insert into public.box_items (box_id, product_id, quantity) values ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 1)$$,
  'P0001', 'box_not_box', 'box: si compone solo un prodotto marcato come box'
);

----------------------------------------------------------------------------
-- ANONIMO
----------------------------------------------------------------------------
reset role;
select tests.as_anon();
select results_eq(
  $$select slug from public.products where slug like 'test-%' order by slug$$,
  $$values ('test-box'), ('test-crema')$$,
  'anon: vede solo i prodotti attivi di produttori pubblici e fornitori attivi'
);
select throws_ok($$select cost_cents from public.products$$, '42501', null, 'anon: il costo d''acquisto non è leggibile');
select throws_ok($$select supplier_id from public.products$$, '42501', null, 'anon: il fornitore non è leggibile');
select throws_ok($$select supplier_sku from public.products$$, '42501', null, 'anon: il codice del fornitore non è leggibile');
select throws_ok($$select stripe_price_id from public.products$$, '42501', null, 'anon: l''id del prezzo Stripe non è leggibile');
select throws_ok($$select * from public.suppliers$$, '42501', null, 'anon: non legge i fornitori');
select throws_ok($$select email from public.producers$$, '42501', null, 'anon: l''email del produttore non è leggibile');
select throws_ok($$select vat_number from public.producers$$, '42501', null, 'anon: la partita IVA non è leggibile');
select results_eq(
  $$select slug from public.producers where slug like 'test-%'$$,
  $$values ('test-produttore')$$,
  'anon: vede solo il produttore pubblico e attivo'
);
select results_eq(
  $$select target_id from public.product_links where product_id = 'd0000000-0000-0000-0000-000000000001'$$,
  $$values ('c0000000-0000-0000-0000-000000000001'::uuid)$$,
  'anon: i collegamenti passano solo verso luoghi attivi'
);
select results_eq(
  $$select count(*)::int from public.box_items where box_id = 'd0000000-0000-0000-0000-000000000005'$$,
  $$values (1)$$,
  'anon: la composizione della box è visibile'
);
select results_eq(
  $$select count(*)::int from public.product_media where product_id = 'd0000000-0000-0000-0000-000000000001'$$,
  $$values (2)$$,
  'anon: la galleria di un prodotto vendibile è visibile'
);
select is_empty(
  $$select 1 from public.product_media where product_id = 'd0000000-0000-0000-0000-000000000004'$$,
  'anon: la galleria di un prodotto non vendibile non è visibile'
);
select results_eq(
  $$select public.product_is_sellable('d0000000-0000-0000-0000-000000000002')$$,
  $$values (false)$$,
  'anon: un prodotto inattivo non è vendibile'
);
select results_eq(
  $$select public.product_is_sellable('d0000000-0000-0000-0000-000000000003')$$,
  $$values (false)$$,
  'anon: un prodotto con fornitore spento non è vendibile'
);
select throws_ok(
  $$insert into public.products (slug, producer_id, supplier_id, supplier_sku, title, category, price_cents, vat_rate, weight_g) values ('test-anon', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'SKU-A', 'x', 'dolci', 1, 4, 1)$$,
  '42501', null, 'anon: non crea prodotti'
);
select throws_ok(
  $$insert into public.product_media (product_id, media_id) values ('d0000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'anon: non scrive la galleria'
);
select results_eq(
  $$select count(*)::int from public.search_site('crema', 'it') where kind = 'product' and slug like 'test-%'$$,
  $$values (1)$$,
  'anon: la ricerca trova un prodotto vendibile'
);
select is_empty(
  $$select 1 from public.search_site('prodotto', 'it') where kind = 'product' and slug like 'test-%'$$,
  'anon: la ricerca non espone prodotti non vendibili'
);

----------------------------------------------------------------------------
-- ALTRO UTENTE (bob non è admin)
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('bob');
select results_eq(
  $$select slug from public.products where slug like 'test-%' order by slug$$,
  $$values ('test-box'), ('test-crema')$$,
  'utente: vede gli stessi prodotti vendibili dell''anonimo'
);
select throws_ok($$select cost_cents from public.products$$, '42501', null, 'utente: il costo non è leggibile');
select is_empty($$select 1 from public.suppliers$$, 'utente: non vede nessun fornitore (la RLS lo nasconde, le policy sono solo admin)');
select throws_ok($$select email from public.producers$$, '42501', null, 'utente: l''email del produttore non è leggibile');
select throws_ok(
  $$insert into public.producers (slug, name, email) values ('test-nuovo', 'Nuovo', 'nuovo@example.com')$$,
  '42501', null, 'utente: non crea produttori'
);
select throws_ok(
  $$insert into public.products (slug, producer_id, supplier_id, supplier_sku, title, category, price_cents, vat_rate, weight_g) values ('test-utente', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'SKU-U', 'x', 'dolci', 1, 4, 1)$$,
  '42501', null, 'utente: non crea prodotti'
);
select throws_ok(
  $$insert into public.product_media (product_id, media_id) values ('d0000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'utente: non scrive la galleria'
);
select throws_ok(
  $$insert into public.product_links (product_id, kind, target_id) values ('d0000000-0000-0000-0000-000000000001', 'place', 'c0000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'utente: non scrive i collegamenti'
);
select throws_ok(
  $$insert into public.box_items (box_id, product_id, quantity) values ('d0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000002', 1)$$,
  '42501', null, 'utente: non compone le box'
);
reset role;
select tests.authenticate_as('bob');
update public.products set price_cents = 1 where slug = 'test-crema';
reset role;
select is((select price_cents from public.products where slug = 'test-crema'), 1200, 'utente: update di un prodotto senza effetto');

----------------------------------------------------------------------------
-- MEDIA: una copertina o una foto è pubblica solo se appartiene a un prodotto vendibile
----------------------------------------------------------------------------
reset role;
select results_eq(
  $$select public.media_is_public('ee000000-0000-0000-0000-000000000001'::uuid)$$,
  $$values (true)$$,
  'media: la copertina di un prodotto vendibile è pubblica'
);
select results_eq(
  $$select public.media_is_public('ee000000-0000-0000-0000-000000000003'::uuid)$$,
  $$values (true)$$,
  'media: la foto della galleria di un prodotto vendibile è pubblica'
);
select results_eq(
  $$select public.media_is_public('ee000000-0000-0000-0000-000000000002'::uuid)$$,
  $$values (false)$$,
  'media: la foto della galleria di un produttore privato non è pubblica'
);
select results_eq(
  $$select public.media_is_public('ee000000-0000-0000-0000-000000000004'::uuid)$$,
  $$values (false)$$,
  'media: la copertina di un prodotto inattivo non è pubblica'
);

----------------------------------------------------------------------------
-- ADMIN
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('admin');
select results_eq(
  $$select slug from public.products where slug like 'test-%' order by slug$$,
  $$values ('test-box'), ('test-bozza'), ('test-crema'), ('test-fornitore-spento'), ('test-privato')$$,
  'admin: vede anche i prodotti inattivi e quelli con fornitore spento'
);
select isnt_empty($$select 1 from public.suppliers$$, 'admin: vede i fornitori');
select isnt_empty($$select 1 from public.producers where slug = 'test-privato'$$, 'admin: vede anche i produttori non pubblici');
select lives_ok(
  $$insert into public.suppliers (name, kind, contact_email) values ('Fornitore nuovo', 'manual', 'nuovo@example.com')$$,
  'admin: crea un fornitore'
);
select lives_ok(
  $$update public.products set is_active = true where slug = 'test-bozza'$$,
  'admin: attiva un prodotto completo'
);
select throws_ok($$select cost_cents from public.products$$, '42501', null, 'admin: il costo si legge con dbAdmin, non dal client');

select * from finish();
rollback;
