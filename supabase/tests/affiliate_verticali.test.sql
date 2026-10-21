-- Verticali affiliate (passo 3.2): righe dei partner nuovi (migrazione 20261020212320), lettura dei
-- template solo tramite affiliate_partner_config, scrittura solo admin, record_vertical_click per ogni
-- verticale e vincolo sulle verticali (migrazione 20261020212234).
-- Nessuna dipendenza dal seed: utenti e subid sono creati nella transazione (prefisso testverti-).
-- Ruoli: anonimo, utente (alice), admin.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('admin', true);

----------------------------------------------------------------------------
-- RIGHE: tredici partner nuovi, undici attivi (pitchup e samboat sono inattivi)
----------------------------------------------------------------------------
select is(
  (select count(*)::int from public.affiliate_partners
   where partner in ('hostelworld', 'pitchup', 'rentalcars', 'ferryhopper', 'directferries', 'omio', 'welcomepickups',
                     'tiqets', 'clickandboat', 'samboat', 'heymondo', 'airalo', 'radicalstorage')),
  13,
  'righe: tredici partner nuovi presenti'
);
select results_eq(
  $$select partner::text from public.affiliate_partners
    where partner in ('pitchup', 'samboat') and not is_active order by partner$$,
  $$values ('pitchup'::text), ('samboat'::text)$$,
  'righe: pitchup e samboat inattivi'
);
select is(
  (select verticals from public.affiliate_partners where partner = 'ferryhopper'),
  array['ferry']::text[],
  'righe: ferryhopper serve la verticale ferry'
);
select is(
  (select verticals from public.affiliate_partners where partner = 'omio'),
  array['train']::text[],
  'righe: omio serve la verticale train'
);
select is(
  (select search_url_template from public.affiliate_partners where partner = 'booking'),
  'https://www.booking.com/searchresults.html?ss={place}&checkin={checkin}&checkout={checkout}&group_adults={adults}&aid={partner_id}&label={subid}&lang={locale}&nflt={kind}',
  'righe: booking cerca per luogo (segnaposto place) e ha il filtro del tipo (kind)'
);

----------------------------------------------------------------------------
-- ANONIMO: colonne pubbliche dei partner attivi, template solo tramite la funzione
----------------------------------------------------------------------------
select tests.as_anon();
select is(
  (select count(*)::int from public.affiliate_partners
   where partner in ('hostelworld', 'pitchup', 'rentalcars', 'ferryhopper', 'directferries', 'omio', 'welcomepickups',
                     'tiqets', 'clickandboat', 'samboat', 'heymondo', 'airalo', 'radicalstorage')),
  11,
  'anonimo: vede solo i partner nuovi attivi'
);
select throws_ok($$select search_url_template from public.affiliate_partners where partner = 'ferryhopper'$$, '42501', null, 'anonimo: template non leggibile');
select throws_ok($$select allowed_hosts from public.affiliate_partners where partner = 'heymondo'$$, '42501', null, 'anonimo: host non leggibili');
select results_eq(
  $$select allowed_hosts, subid_param from public.affiliate_partner_config('ferryhopper')$$,
  $$values (array['www.ferryhopper.com']::text[], null::text)$$,
  'anonimo: affiliate_partner_config restituisce host e subid (null: parametro non noto)'
);
select results_eq(
  $$select is_active from public.affiliate_partner_config('pitchup')$$,
  $$values (false)$$,
  'anonimo: affiliate_partner_config restituisce anche il partner inattivo (il server lo rifiuta)'
);
select throws_ok($$update public.affiliate_partners set name = 'Hack' where partner = 'tiqets'$$, '42501', null, 'anonimo: non scrive');

----------------------------------------------------------------------------
-- UTENTE (alice): nessuna lettura dei template, nessuna scrittura
----------------------------------------------------------------------------
select tests.authenticate_as('alice');
select throws_ok($$select search_url_template from public.affiliate_partners$$, '42501', null, 'utente: template non leggibile');
select lives_ok($$update public.affiliate_partners set name = 'Hack' where partner = 'tiqets'$$, 'utente: update senza righe visibili non è errore');

reset role;
select is(
  (select name from public.affiliate_partners where partner = 'tiqets'),
  'Tiqets',
  'utente: il nome di Tiqets non è cambiato'
);

----------------------------------------------------------------------------
-- ADMIN: scrive, vede anche gli inattivi
----------------------------------------------------------------------------
select tests.authenticate_as('admin');
select lives_ok(
  $$update public.affiliate_partners set name = 'SamBoat (test)' where partner = 'samboat'$$,
  'admin: aggiorna il nome di un partner inattivo'
);
select results_eq(
  $$select partner::text from public.affiliate_partners where partner = 'samboat'$$,
  $$values ('samboat'::text)$$,
  'admin: vede il partner inattivo'
);

----------------------------------------------------------------------------
-- VINCOLO SULLE VERTICALI (come proprietario della migrazione)
----------------------------------------------------------------------------
reset role;
select throws_ok(
  $$update public.affiliate_partners set verticals = '{hotel}' where partner = 'tiqets'$$,
  '23514', null, 'vincoli: verticale fuori elenco (hotel)'
);
select lives_ok(
  $$update public.affiliate_partners set verticals = '{tickets}' where partner = 'tiqets'$$,
  'vincoli: verticale nuova nell''elenco (tickets)'
);
select throws_ok(
  $$update public.affiliate_partners set partner_id_env = 'tiqets_key' where partner = 'tiqets'$$,
  '23514', null, 'vincoli: nome della variabile non in maiuscolo'
);

----------------------------------------------------------------------------
-- RECORD_VERTICAL_CLICK: una verticale per partner, host consentito, partner e verticale coerenti
----------------------------------------------------------------------------
select tests.as_anon();
select results_eq(
  $$select public.record_vertical_click('hostelworld', 'lodging', 'testverti0001', 'page', 'https://www.hostelworld.com/s?city=Catania')$$,
  $$values ('testverti0001'::text)$$,
  'click: alloggi (ostello, alternativa)'
);
select results_eq(
  $$select public.record_vertical_click('rentalcars', 'car', 'testverti0002', 'page', 'https://www.rentalcars.com/')$$,
  $$values ('testverti0002'::text)$$,
  'click: noleggio (alternativa)'
);
select results_eq(
  $$select public.record_vertical_click('ferryhopper', 'ferry', 'testverti0003', 'page', 'https://www.ferryhopper.com/')$$,
  $$values ('testverti0003'::text)$$,
  'click: traghetti'
);
select results_eq(
  $$select public.record_vertical_click('omio', 'train', 'testverti0004', 'page', 'https://www.omio.com/')$$,
  $$values ('testverti0004'::text)$$,
  'click: treni e bus'
);
select results_eq(
  $$select public.record_vertical_click('welcomepickups', 'transfer', 'testverti0005', 'page', 'https://www.welcomepickups.com/')$$,
  $$values ('testverti0005'::text)$$,
  'click: transfer'
);
select results_eq(
  $$select public.record_vertical_click('tiqets', 'tickets', 'testverti0006', 'page', 'https://www.tiqets.com/')$$,
  $$values ('testverti0006'::text)$$,
  'click: biglietti'
);
select results_eq(
  $$select public.record_vertical_click('clickandboat', 'boat', 'testverti0007', 'page', 'https://www.clickandboat.com/')$$,
  $$values ('testverti0007'::text)$$,
  'click: barche'
);
select results_eq(
  $$select public.record_vertical_click('heymondo', 'insurance', 'testverti0008', 'page', 'https://www.heymondo.it/')$$,
  $$values ('testverti0008'::text)$$,
  'click: assicurazione (host italiano www.heymondo.it)'
);
select results_eq(
  $$select public.record_vertical_click('airalo', 'esim', 'testverti0009', 'page', 'https://www.airalo.com/')$$,
  $$values ('testverti0009'::text)$$,
  'click: eSIM'
);
select results_eq(
  $$select public.record_vertical_click('radicalstorage', 'luggage', 'testverti0010', 'page', 'https://radicalstorage.com/')$$,
  $$values ('testverti0010'::text)$$,
  'click: deposito bagagli'
);

-- Prove a rovescio.
select throws_ok(
  $$select public.record_vertical_click('samboat', 'boat', 'testverti0020', 'page', 'https://www.samboat.com/')$$,
  'P0001', 'partner_not_active', 'prova: partner inattivo (samboat)'
);
select throws_ok(
  $$select public.record_vertical_click('heymondo', 'ferry', 'testverti0021', 'page', 'https://www.heymondo.it/')$$,
  'P0001', 'vertical_not_allowed', 'prova: verticale che il partner non serve (heymondo sui traghetti)'
);
select throws_ok(
  $$select public.record_vertical_click('tiqets', 'hotel', 'testverti0022', 'page', 'https://www.tiqets.com/')$$,
  'P0001', 'vertical_not_allowed', 'prova: verticale fuori elenco'
);
select throws_ok(
  $$select public.record_vertical_click('tiqets', 'tickets', 'testverti0023', 'page', 'https://www.hostelworld.com/')$$,
  'P0001', 'target_not_allowed', 'prova: host di un altro partner'
);
select throws_ok(
  $$select public.record_vertical_click('ferryhopper', 'ferry', 'testverti0024', 'page', 'http://www.ferryhopper.com/')$$,
  'P0001', 'target_not_allowed', 'prova: template http'
);
select throws_ok(
  $$select public.record_vertical_click('ferryhopper', 'ferry', 'testverti0025', 'page', 'https://www.ferryhopper.com.evil.test/')$$,
  'P0001', 'target_not_allowed', 'prova: host con suffisso estraneo'
);
select throws_ok(
  $$select public.record_vertical_click('ferryhopper', 'ferry', 'testverti0026', 'page', 'https://www.ferryhopper.com@evil.test/')$$,
  'P0001', 'target_not_allowed', 'prova: userinfo nel URL'
);
select throws_ok(
  $$select public.record_vertical_click('nonesiste', 'ferry', 'testverti0027', 'page', 'https://www.ferryhopper.com/')$$,
  '22P02', null, 'prova: partner fuori dall''enum'
);

reset role;
select is(
  (select count(*)::int from public.affiliate_clicks where subid in (
    'testverti0001','testverti0002','testverti0003','testverti0004','testverti0005',
    'testverti0006','testverti0007','testverti0008','testverti0009','testverti0010')),
  10,
  'click: una riga per ogni verticale (dieci)'
);
select is(
  (select count(*)::int from public.affiliate_clicks where subid like 'testverti002%' or subid like 'testverti0027%'),
  0,
  'click: nessuna riga per i click rifiutati'
);

select * from finish();
rollback;
