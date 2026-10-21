-- Passo 3.2 (verticali affiliate): righe di configurazione dei partner nuovi e template di Booking
-- e dei partner con pagina verificata. Configurazione reale, non dati demo: il seed non la tocca.
-- Dopo l'enum (20261021151338) e il vincolo sulle verticali (20261021151359).
--
-- Regole dei template (docs/LANCIO.md, sezione 4):
--  - {page}: segmento della pagina verificata (mappa chiusa in src/server/affiliates/vertical-pages.ts,
--    per slug del luogo, codice aeroporto o tratta). Senza pagina per la ricerca il link va alla home
--    del primo host in allowed_hosts: nessuna ricerca arriva al partner (passesSearch "none").
--  - subid_param null quando il parametro non è verificato: il link esce senza subid nell'URL; il click
--    si registra comunque.
--  - partner_id_env: nome della variabile d'ambiente con l'ID (src/lib/partner-env-names.ts). Nessun
--    template porta ancora il parametro dell'ID: va aggiunto quando il programma ne conferma il nome.
--  - is_active false: partner non cliccabile (pitchup: nessun programma per publisher trovato; samboat:
--    programma italiano in pausa secondo Cuelinks).
--  - Verifica dei deep link: scratchpad verifica-deeplink.md (2026-10-21). Dove è indicato "non verificato",
--    il link va alla home o alla pagina di destinazione verificata.

----------------------------------------------------------------------------
-- BOOKING: ricerca per luogo (slug del catalogo, risolto nel nome dal server) con date e persone.
-- Il formato searchresults è documentato da anni. ht_id resta vuoto: i valori del filtro per tipo non
-- sono verificati (KIND_FILTER vuota in vertical-links.ts), quindi il parametro nflt si toglie.
-- aid e label: formato verificato: no (non confermato nel Partner Centre).
----------------------------------------------------------------------------
update public.affiliate_partners
set search_url_template = 'https://www.booking.com/searchresults.html?ss={place}&checkin={checkin}&checkout={checkout}&group_adults={adults}&aid={partner_id}&label={subid}&lang={locale}&nflt={kind}',
    updated_at = now()
where partner = 'booking';

----------------------------------------------------------------------------
-- DISCOVERCARS: pagina della destinazione Catania per l'aeroporto CTA (verificato: pagina valida).
-- I parametri di data della ricerca non pre-compilano il form: non si usano. subid_param null.
----------------------------------------------------------------------------
update public.affiliate_partners
set search_url_template = 'https://www.discovercars.com/{page}',
    subid_param = null,
    updated_at = now()
where partner = 'discovercars';

----------------------------------------------------------------------------
-- NUOVI PARTNER (righe base). on conflict: la migrazione non sovrascrive quello che l'admin ha cambiato.
----------------------------------------------------------------------------
insert into public.affiliate_partners
  (partner, name, verticals, search_url_template, allowed_hosts, subid_param, partner_id_env, is_active)
values
  -- formato verificato: sì, pagina città con data e ospiti (Palermo, city_id 1216). Il link porta da
  -- Palermo con date e ospiti; altre città: home. Fonte: verifica-deeplink, hostelworld.com/pwa/s.
  ('hostelworld', 'Hostelworld', '{lodging}',
    'https://www.hostelworld.com/pwa/s?{page}&from={checkin}&to={checkout}&guests={adults}',
    '{www.hostelworld.com}', null, 'HOSTELWORLD_AFFILIATE_ID', true),
  -- formato verificato: no. Nessun programma per publisher trovato: inattivo. Home.
  ('pitchup', 'Pitchup', '{lodging}', 'https://www.pitchup.com/',
    '{www.pitchup.com}', null, 'PITCHUP_AFFILIATE_ID', false),
  -- formato verificato: sì, pagina dell'aeroporto di Catania (CTA). Fonte: verifica-deeplink, rentalcars.com.
  -- La ricerca con parametri restituisce 400: non si usa.
  ('rentalcars', 'Rentalcars.com', '{car}', 'https://www.rentalcars.com/{page}',
    '{www.rentalcars.com}', null, 'RENTALCARS_AFFILIATE_ID', true),
  -- formato verificato: no (formato del link di rotta visto, esito non confermato). Home.
  -- Fonte: verifica-deeplink, ferryhopper.com/en/ferry-routes/direct/milazzo-lipari.
  ('ferryhopper', 'Ferryhopper', '{ferry}', 'https://www.ferryhopper.com/',
    '{www.ferryhopper.com}', null, 'FERRYHOPPER_AFFILIATE_ID', true),
  -- formato verificato: sì, pagina della tratta Milazzo-Lipari; altre tratte: home. Fonte: verifica-deeplink,
  -- directferries.com/milazzo_lipari_ferry.htm.
  ('directferries', 'Direct Ferries', '{ferry}', 'https://www.directferries.com/{page}',
    '{www.directferries.com}', null, 'DIRECTFERRIES_AFFILIATE_ID', true),
  -- formato verificato: no. Home (il sito risponde 403 alla verifica: da provare nel browser).
  ('omio', 'Omio', '{train}', 'https://www.omio.com/',
    '{www.omio.com}', null, 'OMIO_AFFILIATE_ID', true),
  -- formato verificato: no. Home (403 alla verifica: da provare nel browser).
  ('welcomepickups', 'Welcome Pickups', '{transfer}', 'https://www.welcomepickups.com/',
    '{www.welcomepickups.com}', null, 'WELCOMEPICKUPS_AFFILIATE_ID', true),
  -- formato verificato: sì, pagina della città Palermo; altre città: home. Fonte: verifica-deeplink, tiqets.com.
  ('tiqets', 'Tiqets', '{tickets}', 'https://www.tiqets.com/{page}',
    '{www.tiqets.com}', null, 'TIQETS_AFFILIATE_ID', true),
  -- formato verificato: sì, pagina della città Palermo; altre città: home. Fonte: verifica-deeplink,
  -- clickandboat.com/us/boat-rental/italy/palermo. Il programma è su Impact: il link di rete va incollato.
  ('clickandboat', 'Click&Boat', '{boat}', 'https://www.clickandboat.com/{page}',
    '{www.clickandboat.com}', null, 'CLICKANDBOAT_AFFILIATE_ID', true),
  -- formato verificato: no. Programma italiano in pausa: inattivo.
  ('samboat', 'SamBoat', '{boat}', 'https://www.samboat.com/',
    '{www.samboat.com}', null, 'SAMBOAT_AFFILIATE_ID', false),
  -- formato verificato: sì, home italiana (heymondo.it, 200). La pagina dell'assicurazione non è stata
  -- provata: il link va alla home. Fonte: verifica-deeplink.
  ('heymondo', 'Heymondo', '{insurance}', 'https://www.heymondo.it/',
    '{www.heymondo.it}', null, 'HEYMONDO_AFFILIATE_ID', true),
  -- formato verificato: sì, pagina Italia (Italy-esim, 200). Fonte: verifica-deeplink, airalo.com.
  ('airalo', 'Airalo', '{esim}', 'https://www.airalo.com/Italy-esim',
    '{www.airalo.com}', null, 'AIRALO_AFFILIATE_ID', true),
  -- formato verificato: sì, pagina della città Palermo; altre città: home. Fonte: verifica-deeplink,
  -- radicalstorage.com/luggage-storage/palermo. Il dominio è senza www. Attivo: confermare il programma.
  ('radicalstorage', 'Radical Storage', '{luggage}', 'https://radicalstorage.com/{page}',
    '{radicalstorage.com}', null, 'RADICALSTORAGE_AFFILIATE_ID', true)
on conflict (partner) do nothing;
