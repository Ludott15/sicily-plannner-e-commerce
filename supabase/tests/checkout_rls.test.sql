-- Checkout (passo 7.2): checkout_sessions, stripe_events e le funzioni del checkout e della scadenza.
-- Ruoli: anonimo, proprietario (alice), altro utente (bob), ospite, admin.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('admin', true);
select tests.create_guest('ospite');

-- Punti di alice: 1000 (admin_adjust). Scritti come postgres.
insert into public.points_ledger (user_id, delta, reason, ref_type, ref_id, season)
values (tests.uid('alice'), 1000, 'admin_adjust', 'test', gen_random_uuid(), '2026-estate');

----------------------------------------------------------------------------
-- FUNZIONE: punti del checkout, una volta per sessione
----------------------------------------------------------------------------
select tests.authenticate_as('alice');
select results_eq(
  $$select discount_cents, points_redeemed from public.checkout_create(
      '51111111-aaaa-4000-8000-000000000001', '[{"productId":"61111111-aaaa-4000-8000-000000000001","quantity":2,"unitPriceCents":3000,"vatRate":10,"title":"t"}]'::jsonb,
      6000, 0, true, 100, 15, '2099-01-01T00:00:00Z', encode(sha256(convert_to('tok-1', 'UTF8')), 'hex'))$$,
  $$values (900, 900)$$,
  'punti: sconto limitato al 15% del subtotale (900 su 6000)'
);
select results_eq(
  $$select discount_cents, points_redeemed from public.checkout_create(
      '51111111-aaaa-4000-8000-000000000002', '[{"productId":"61111111-aaaa-4000-8000-000000000001","quantity":2,"unitPriceCents":3000,"vatRate":10,"title":"t"}]'::jsonb,
      6000, 0, true, 100, 15, '2099-01-01T00:00:00Z', encode(sha256(convert_to('tok-2', 'UTF8')), 'hex'))$$,
  $$values (100, 100)$$,
  'punti: con 100 residui lo sconto è di 1 euro'
);
select results_eq(
  $$select discount_cents, points_redeemed from public.checkout_create(
      '51111111-aaaa-4000-8000-000000000003', '[{"productId":"61111111-aaaa-4000-8000-000000000001","quantity":2,"unitPriceCents":3000,"vatRate":10,"title":"t"}]'::jsonb,
      6000, 0, true, 100, 15, '2099-01-01T00:00:00Z', encode(sha256(convert_to('tok-3', 'UTF8')), 'hex'))$$,
  $$values (0, 0)$$,
  'punti: saldo esaurito, nessuno sconto e nessun errore'
);
select throws_ok(
  $$select * from public.checkout_create(
      '51111111-aaaa-4000-8000-000000000004', '[{"productId":"61111111-aaaa-4000-8000-000000000001","quantity":2,"unitPriceCents":3000,"vatRate":10,"title":"t"}]'::jsonb,
      6001, 0, false, 100, 15, '2099-01-01T00:00:00Z', encode(sha256(convert_to('tok-4', 'UTF8')), 'hex'))$$,
  'P0001', 'checkout_mismatch',
  'prova a rovescio: subtotale diverso dal carrello, nessuna sessione creata'
);
select results_eq(
  $$select count(*)::int from public.points_ledger where user_id = tests.uid('alice') and reason = 'redeem'$$,
  $$values (2)$$,
  'punti: una riga redeem per ogni checkout con sconto'
);

select tests.authenticate_as('bob');
select results_eq(
  $$select count(*)::int from public.points_ledger where user_id = tests.uid('alice')$$,
  $$values (0)$$,
  'punti: altro utente non vede il ledger di alice'
);

----------------------------------------------------------------------------
-- OSPITI E ANONIMI: nessun punto, nessun user_id
----------------------------------------------------------------------------
reset role;
select tests.authenticate_as('ospite');
select results_eq(
  $$select discount_cents, points_redeemed from public.checkout_create(
      '51111111-aaaa-4000-8000-000000000005', '[{"productId":"61111111-aaaa-4000-8000-000000000001","quantity":2,"unitPriceCents":3000,"vatRate":10,"title":"t"}]'::jsonb,
      6000, 0, true, 100, 15, '2099-01-01T00:00:00Z', encode(sha256(convert_to('tok-5', 'UTF8')), 'hex'))$$,
  $$values (0, 0)$$,
  'ospite: nessuno sconto con punti richiesti'
);
select tests.as_anon();
select results_eq(
  $$select discount_cents from public.checkout_create(
      '51111111-aaaa-4000-8000-000000000006', '[{"productId":"61111111-aaaa-4000-8000-000000000001","quantity":2,"unitPriceCents":3000,"vatRate":10,"title":"t"}]'::jsonb,
      6000, 0, true, 100, 15, '2099-01-01T00:00:00Z', encode(sha256(convert_to('tok-6', 'UTF8')), 'hex'))$$,
  $$values (0)$$,
  'visitatore senza sessione: nessuno sconto'
);
reset role;
select results_eq(
  $$select user_id from public.checkout_sessions where id = '51111111-aaaa-4000-8000-000000000005'$$,
  $$values (null::uuid)$$,
  'ospite: la riga non ha user_id'
);

----------------------------------------------------------------------------
-- TOKEN: senza il token della riga le funzioni del checkout rifiutano, anche con l'uuid giusto
----------------------------------------------------------------------------
select tests.as_anon();
select throws_ok(
  $$select public.checkout_attach_stripe_session('51111111-aaaa-4000-8000-000000000001', 'token-sbagliato', 'cs_test_x')$$,
  '42501', 'checkout_token_invalid',
  'token: senza il token giusto il collegamento della sessione è rifiutato'
);
select throws_ok(
  $$select public.checkout_release('51111111-aaaa-4000-8000-000000000001', '')$$,
  '42501', 'checkout_token_invalid',
  'token: senza il token giusto il rilascio è rifiutato'
);
select throws_ok(
  $$select public.checkout_release('51111111-aaaa-4000-8000-000000000001', 'tok-2')$$,
  '42501', 'checkout_token_invalid',
  'token: il token di un''altra riga non vale'
);
reset role;

----------------------------------------------------------------------------
-- SCADENZA E RILASCIO: i punti tornano una volta sola
----------------------------------------------------------------------------
select results_eq(
  $$select public.checkout_expire_from_stripe('51111111-aaaa-4000-8000-000000000001', 'cs_test_alice_1')$$,
  $$values (true)$$,
  'scadenza: la sessione aperta si chiude'
);
select results_eq(
  $$select public.checkout_expire_from_stripe('51111111-aaaa-4000-8000-000000000001', 'cs_test_alice_1')$$,
  $$values (false)$$,
  'scadenza: un secondo evento non ha effetti'
);
select results_eq(
  $$select count(*)::int from public.points_ledger where reason = 'redeem_refund' and ref_id = '51111111-aaaa-4000-8000-000000000001'$$,
  $$values (1)$$,
  'scadenza: i punti tornano una volta sola'
);
select results_eq(
  $$select public.checkout_attach_stripe_session('51111111-aaaa-4000-8000-000000000002', 'tok-2', 'cs_test_alice_2')$$,
  $$values (true)$$,
  'collegamento: la sessione Stripe si collega alla riga aperta'
);
select results_eq(
  $$select public.checkout_release('51111111-aaaa-4000-8000-000000000002', 'tok-2')$$,
  $$values (false)$$,
  'rilascio: una riga con sessione Stripe non si rilascia'
);

----------------------------------------------------------------------------
-- PERMESSI: anonimo, proprietario, altro utente, admin
----------------------------------------------------------------------------
select tests.as_anon();
select throws_ok($$select * from public.checkout_sessions$$, '42501', null, 'anonimo: non legge le sessioni di checkout');
select throws_ok($$select * from public.stripe_events$$, '42501', null, 'anonimo: non legge gli eventi Stripe');
select throws_ok(
  $$select public.checkout_expire_from_stripe(null, 'cs_x')$$,
  '42501', null,
  'anonimo: non chiama la scadenza dal webhook'
);

select tests.authenticate_as('alice');
select throws_ok(
  format($$insert into public.checkout_sessions (id, user_id, cart, subtotal_cents, shipping_cents, expires_at) values (gen_random_uuid(), %L, '[]', 0, 0, now())$$, tests.uid('alice')),
  '42501', null,
  'proprietario: non crea sessioni dal client'
);
select throws_ok($$update public.checkout_sessions set status = 'completed'$$, '42501', null, 'proprietario: non cambia lo stato');
select throws_ok($$select public.checkout_close('51111111-aaaa-4000-8000-000000000003', 'expired')$$, '42501', null, 'proprietario: non chiama checkout_close');
select results_eq(
  $$select count(*)::int from public.checkout_sessions$$,
  $$values (3)$$,
  'proprietario: vede le sue tre sessioni, non quelle degli altri'
);
select throws_ok($$select token_hash from public.checkout_sessions$$, '42501', null, 'proprietario: non legge l''hash del token');
select results_eq($$select count(*)::int from public.stripe_events$$, $$values (0)$$, 'proprietario: non legge gli eventi Stripe');

select tests.authenticate_as('bob');
select results_eq($$select count(*)::int from public.checkout_sessions$$, $$values (0)$$, 'altro utente: non vede le sessioni di alice');

select tests.authenticate_as('admin');
select results_eq($$select count(*)::int >= 5 from public.checkout_sessions$$, $$values (true)$$, 'admin: vede tutte le sessioni');

select * from finish();
rollback;
