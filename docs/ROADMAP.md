# Roadmap fino al lancio: i prompt, in ordine

Ottobre 2026. Ogni sezione "Prompt" si incolla così com'è in una sessione nuova di Claude Code, partendo da `main` aggiornato. Una sessione = una PR = una feature completa in verticale. Si passa al prompt successivo solo dopo il merge del precedente, salvo dove è scritto "in parallelo".

Le fonti vincolanti restano [spec.md](spec.md), [CLAUDE.md](../CLAUDE.md), [design/README.md](design/README.md), [IMMAGINI.md](IMMAGINI.md) e [LANCIO.md](LANCIO.md): questa roadmap le mette in fila e aggiunge quello che mancava. Se un prompt e la spec non coincidono, vale il prompt più recente; la sessione aggiorna la spec nella stessa PR.

Stato al 14 ottobre 2026: fatte M1, M2 (schema 2e incluso), DS, M3, M4 parti 1, 2, 3 e 5, M5 prima fetta, immagini del catalogo con foto da Wikipedia/Commons. In sospeso in `src/lib/pending-actions.ts`: punti (M9), shop (M10), noleggio e link partner (M6), testi di Chi siamo e consensi, testi legali.

### Stato dei passi

Aggiornato da ogni PR. "In PR" = aperta e in attesa di merge; le PR dei passi successivi partono dal branch della precedente.

| Passo | Stato | Branch |
| --- | --- | --- |
| 1.1 Import CSV del catalogo | Fatto (#34); rifiniture (2 MB, coordinate in Sicilia, modello con esempi, guida Excel) in PR | `roadmap/1.1-import-csv-rifiniture` |
| 1.2 Home | In PR: hero con foto, carosello "Dove andare in Sicilia", itinerari pronti con aree | `roadmap/1.2-home` |
| 1.3 Itinerari pronti | In PR: editor admin con trascinamento, controlli di pubblicazione, pagina finale con riepilogo, notti e stampa, filtri in URL | `roadmap/1.3-itinerari-pronti` |
| 1.4 Builder, seconda fetta | In PR: trascinamento tra giorni, giorni, note, duplica ed elimina, export .ics, stampa, link pubblico revocabile | `roadmap/1.4-builder` |
| 2.1 Ricerca voli | In PR: barra voli (home, /voli, viaggio, proposte), Travelpayouts con cache di Next 6 h, /api/go/flight firmato, pagine SEO solo con prezzi, LMP e PNL tra gli arrivi | `roadmap/2.1-voli` |
| 3.1 Affiliati su tutte le verticali | In PR: partner come configurazione (tabella + env), /dove-dormire, /noleggio-auto, chip della checklist, /api/go/v firmato, allowlist degli host, rate limit, /affiliazioni, admin partner | `roadmap/3.1-affiliati` |
| 3.2 Import automatico dei partner | In PR: adattatori Viator e GetYourGuide (inattivi senza chiave), collegamento per distanza e somiglianza del nome, attività nuove inattive da verificare, offerte disattivate dopo 3 import mancati, log e avviso in admin, tag proposti dal modello, embedding Voyage | `roadmap/3.2-import-partner` |
| 3.3 Conversioni e commissioni | In PR: import CSV dei report con anteprima e possibili duplicati, cron import-conversions (nessun adattatore attivo), dashboard /admin/affiliati per periodo, contesto, partner e attività, conversioni senza click, esportazione CSV | `roadmap/3.3-conversioni` |
| 1.5 Viaggi su due aree | In PR: matrice dei tempi di guida in admin (28 coppie), composizione di due aree vicine sotto 150 minuti, giorni ripartiti secondo i punteggi, giorno di trasferimento più corto (proposte e viaggio salvato), motivo "Due zone vicine" | `roadmap/1.5-due-aree` |
| 4.1 Gruppi e inviti | In PR: "Viaggia in gruppo" dal viaggio, pagina del gruppo (membri, rinomina, uscita, rimozione, proprietà), link d'invito (7 giorni, 10 usi, rigenerabile, revocabile) ed email (Resend, inattiva senza chiave), /invito/[token] con anteprima e OG, ritorno all'invito dopo accesso e gusti, massimo 30 membri | `roadmap/4.1-gruppi` |
| 4.2 Voti, proposte e tempo reale | In PR: voti +1/-1 su ogni tappa del gruppo (StopVotes), alternative vicine quando i contrari sono almeno la metà, sostituzione solo dell'owner, proposte di aggiunta con accetta/rifiuta e notifica, campanella e /notifiche, registro "Modifiche recenti", tempo reale con broadcast privato ai soli membri | `roadmap/4.2-voti` |
| 4.3 Scoring di gruppo | In PR: preferenze aggregate in SQL (media, minimo 2 con un 5, vincoli più restrittivi) con soglia di privacy a 3 persone, "Interessi comuni" e "Ecco tre viaggi per il gruppo" nella pagina del gruppo, motivi solo pratici sotto 3 membri, alternative ordinate con il profilo del gruppo | `roadmap/4.3-scoring-gruppo` |
| 5.1 Punti, check-in e recensioni | In PR: regole dei punti in point_rules, check-in "Sono qui" con consenso e verifica entro 300 m (posizione non salvata), itinerario completato con 3 luoghi, recensioni con premio da 80 caratteri, segnalazioni e moderazione admin, punti per profilo e inviti, pagina /punti, punti in home | `roadmap/5.1-punti` |
| 5.2 Badge | In PR: criteri tipizzati in badges.criteria, valutazione nel database a ogni accredito e all'ingresso in un gruppo, 5 badge della spec, notifica badge_earned, "I tuoi badge" e progresso in /punti, admin /admin/badge con creazione e modifica | `roadmap/5.2-badge` |
| 5.3 Classifiche | In PR: classifica stagionale (primi 50, posizione propria, opt-out, nome pubblico o iniziali) con refresh ogni 15 minuti via pg_cron, classifica del gruppo nel periodo del viaggio, /classifica, chiusura delle stagioni e stato dei premi in /admin/stagioni | `roadmap/5.3-classifiche` |
| 6.1 Riprogettazione | In PR: navigazione a due livelli (header essenziale, menu personale dall'avatar, barra mobile Esplora/Viaggi/Gruppi/Profilo), pagina /gruppi, intestazione di pagina, schede e menu ⋯ condivisi; viaggio con schede e tappe pulite, gruppo con schede e dialog di invito, flusso dagli itinerari e tutte le altre pagine con lo stesso linguaggio | `roadmap/6.1-design` |
| 6.2 Mappa | In PR: componente TripMap (MapLibre + OpenFreeMap, colori dai token, marker numerati, percorso del giorno, caricamento pigro, stampa, nessun cookie) nel viaggio, negli itinerari pronti, nella pagina del luogo (attività vicine) e in /attivita (vista mappa) | `roadmap/6.2-mappa` |
| 6.3 Identità | In PR: nome Isula in BRAND_NAME, marchio geometrico generato dai token (design:brand), Logo, favicon SVG, apple-icon, icone PWA e manifest, OG con foto di copertina, immagine verticale 1080×1920 in /admin/contenuti, layout email comune con template futuri e template Supabase rigenerati (email:templates) | `roadmap/6.3-identita` |
| 9.1 Chatbot | In PR: /api/chat in streaming NDJSON con i 9 strumenti della spec (Sonnet per la conversazione, Haiku per titolo e riassunto, prompt caching), schede attività da [[activity:id]] solo con id restituiti dagli strumenti, proposte di modifica al viaggio e ai gusti con Accetta/Rifiuta rivalidate al momento dell'accettazione, limite giornaliero (40, ospiti 10) e per IP fail closed, /chat e pannello nel viaggio, /admin/ai con costi senza contenuti, dati del catalogo marcati come dati, valutazione su 20 richieste (workflow manuale) | `roadmap/9.1-chatbot` |
| 10.1 Apprendimento e analisi | In PR: cron notturno /api/cron/learn (learn_from_events con decadimento 5%, forza del tag, clamp ±2, lock contro esecuzioni sovrapposte) e embedding del profilo come media delle attività positive a 90 giorni; similarità coseno nello scoring da 5 eventi (my_event_count, eventi sempre non leggibili); home admin con i numeri del periodo (utenti, ospiti convertiti stimati, viaggi, click e commissioni, ordini, costo AI per utente attivo, inviti) | `roadmap/10.1-apprendimento` |
| 11.1 SEO e contenuti editoriali | In PR: sitemap per tipo (generateSitemaps) con hreflang elencate in robots.txt, canonical senza query su tutte le pagine pubbliche, dati strutturati da costruttori testati (TouristAttraction, TouristDestination, TouristTrip, Article, Organization, BreadcrumbList, Product pronto), guide editoriali (/guide, admin con Markdown sicuro e collegamenti, bozze invisibili per RLS), pagine di area /sicilia/[area] con descrizioni scritte dall'admin, breadcrumb Sicilia › Area, "Nello stesso itinerario", istruzioni Search Console e Bing | `roadmap/11.1-seo` |
| 11.2 Ricerca interna | In PR: full-text Postgres con configurazione italiana e unaccent più pg_trgm per gli errori di battitura (search_site SECURITY INVOKER, indici di espressione), combobox ARIA nell'header e icona su mobile, /cerca con risultati per tipo e stato vuoto, ricerche senza risultati registrate in forma anonima e visibili in /admin/ricerche | `roadmap/11.2-ricerca` |
| 11.3 PWA e uso in viaggio | In PR: service worker scritto a mano (statici in cache, ultimi 5 viaggi consultabili offline legati alla sessione e svuotati al cambio utente, pagina /offline, avviso "sei offline"), sezione "Oggi" nel viaggio con le tappe del giorno calcolato sul dispositivo e i link a Google Maps e Mappe di Apple, invito all'installazione solo dal secondo viaggio e mai nei browser interni | `roadmap/11.3-pwa` |
| 11.4 Accessibilità e nuovo marchio | In PR: axe-core negli e2e (WCAG 2.2 AA, chiaro/scuro, 1280/390, zero violazioni serie o critiche) con le correzioni trovate, navigazione da tastiera e trappola del focus nei dialog, annunci per voti e salvataggi, dichiarazione di accessibilità; marchio nuovo: piastrella di maiolica con rosetta a tre bracci | `roadmap/11.4-accessibilita` |

---

## Come usare questa roadmap

1. Apri una sessione nuova, incolla il **preambolo comune** e subito sotto il prompt del passo.
2. Quando la sessione dice "pronta al merge" (o, sui percorsi sensibili, si ferma con i conteggi), guarda la CI e unisci tu.
3. Dopo il merge: `git checkout main && git pull`, `npm install`, `npm run db:reset`, `npm run media:demo`, `npm run dev`, e prova a mano la cosa nuova per 5 minuti. Se qualcosa non torna, scrivilo nella stessa sessione prima di passare oltre.
4. I passi marcati **[Tu]** non sono codice: li fai tu (o con commercialista, legale, produttori). Molti richiedono settimane, quindi vanno avviati subito, in parallelo allo sviluppo (Fase 0).
5. I passi marcati **[Decisione]** contengono una scelta da fare prima di incollare il prompt: la risposta va scritta nel prompt al posto delle parentesi quadre.

### Preambolo comune (da incollare all'inizio di ogni prompt)

```
Progetto Sicilia Planner (brand di lavoro "Isula"). Prima di scrivere codice leggi CLAUDE.md, docs/spec.md, docs/ROADMAP.md (il passo indicato sotto), docs/design/README.md e i README dei componenti che userai. Valgono tutte le regole di CLAUDE.md: branch nuovo da main aggiornato, mai push su main, mai merge, una PR verticale (migrazione, RLS, logica, UI, test), Zod → requireUser/requireAdmin → scrittura, dbAsUser di default, dbAdmin solo nei file consentiti, testi solo in messages/it.json e messages/en.json, solo token del design system, nessun contenuto o autore inventato, prefissi demo-/int-/e2e-. Sui percorsi sensibili (RLS e migrazioni, auth e ospiti, pagamenti e webhook, redirect e affiliati, cancellazione dati, CI) prova a rovescio e conteggi dai log della CI, poi fermati. Altrove: CI verde, test per la logica pura, decidi tu i dettagli reversibili e annotali in una riga nella PR. Chiedimi solo le decisioni irreversibili. Riepilogo PR in massimo 10 righe. Se l'azione implementata era in src/lib/pending-actions.ts, toglila dall'elenco. Aggiorna docs/spec.md e docs/ROADMAP.md (stato del passo) nella stessa PR.
```

---

## Fase 0 [Tu] — Da avviare subito, in parallelo a tutto

Questi passi bloccano il lancio più del codice. Nessun prompt: sono cose da fare tu.

**0.1 Nome e marchio.** Verifica che "Isula" sia libero: dominio `.it` e `.com`, ricerca su UIBM ed EUIPO nelle classi 39 (viaggi), 35 (commercio online) e 29-30-33 (alimenti e vini), handle Instagram e TikTok. Se non è libero, decidi il nome prima del passo 8.1 (il nome compare in email, logo, testi).

**0.2 Commercialista.** Partita IVA e codici ATECO che coprano commercio elettronico e provvigioni da affiliazione; regime OSS per le vendite UE oltre 10.000 euro; fatturazione elettronica degli ordini dello shop (serve un servizio: Fatture in Cloud, Aruba o simili, con API). Decidi se vendere **a nome tuo** (sei operatore alimentare, servono registrazioni sanitarie) o **come intermediario** per conto dei produttori: cambia contratti, fatture e testi legali.

**0.3 Partner affiliati.** Iscriviti a Travelpayouts (voli Aviasales, noleggi, hotel, attività), Booking.com Affiliate Partner, GetYourGuide, Viator, Civitatis, DiscoverCars o Rentalcars. Annota per ciascuno: ID affiliato, parametro del subid, regole su cache dei prezzi e uso del marchio. Servono al passo 3.1.

**0.4 Produttori.** Trova 3-5 produttori (pistacchio di Bronte, vino dell'Etna, cioccolato di Modica, capperi di Pantelleria o Salina, olio). Per ciascuno: accordo scritto con prezzi, tempi di spedizione, imballaggio, resi e reclami, schede con ingredienti e allergeni, foto vere con il permesso d'uso. Fai 2-3 ordini di prova veri prima del lancio.

**0.5 Testi legali.** Con un consulente: informativa privacy (profilazione, posizione per i check-in, fornitori extra UE: Anthropic, Vercel, Stripe, Resend), cookie policy, termini d'uso, condizioni di vendita (recesso di 14 giorni ed esclusioni per i deperibili), regolamento dei punti e della classifica (verifica se serve una manifestazione a premi, DPR 430/2001: i premi di fine stagione la rendono probabile), politica delle recensioni (Omnibus: come le verifichi), dichiarazione dei link affiliati. Servono al passo 8.3.

**0.6 Contenuti.** Testi di "Chi siamo" e del fondatore; consigli locali veri per le attività principali; collaboratori locali con consenso scritto; catalogo reale nel CSV del passo 1.1 (descrizioni con parole tue). Obiettivo minimo per il lancio: 8 aree coperte, almeno 60 attività attive con tag, 10 itinerari pronti.

**0.7 Account tecnici di produzione.** Supabase produzione in regione UE (piano Pro per i backup giornalieri), Vercel Pro, Stripe (attivazione dell'account live con i dati fiscali), Resend con il dominio verificato, Cloudflare Turnstile, chiave API di Anthropic con limite di spesa mensile, Sentry (gratuito).

---

## Fase 1 — Catalogo e contenuti

### 1.1 Import CSV del catalogo

Percorso sensibile: solo admin, prova a rovescio sul controllo del ruolo.

```
Passo 1.1 di docs/ROADMAP.md: import CSV del catalogo.
Obiettivo: far entrare nel sistema le attività preparate fuori dal codice, in stato "da verificare".
Fatto quando:
1. Admin > Attività > Importa: caricamento CSV con anteprima prima di salvare (righe valide, righe con errore e motivo, righe che aggiornano). Colonne: slug, name_it, name_en (opzionale), area_slug, place_slug, place_name, place_lat, place_lng, place_tagline_it (max 90 caratteri), description_it, duration_min, on_site_price_eur, requires_car, accessible, season_months, diets_suitable, interests (formato mare:3;storia:2), image_file (nome di un file già caricato in media, cercato su original_filename: se c'è diventa la copertina dell'attività), source_url, notes. Separatore virgola o punto e virgola riconosciuto da solo, UTF-8 con o senza BOM (Excel), massimo 2 MB e 2000 righe.
2. Idempotente (upsert su slug). Le attività nascono inattive con needs_review = true; l'attivazione resta soggetta alla regola dei tag. Un luogo mancante si crea con area e coordinate dal file, inattivo e da rivedere. Coordinate fuori dalla Sicilia (lat 35,4-38,9, lng 11,9-15,7, isole minori comprese) = errore della riga.
3. source_url e notes sono solo interni: mai in pagine o viste pubbliche. Grant per colonna e test pgTAP (anonimo, utente, admin).
4. Coda admin "Da verificare": filtri per area e per dati mancanti (tag, coordinate, area, foto), azioni "Verificata" e "Modifica".
5. Voce in admin_audit_log per ogni importazione (righe create, aggiornate, scartate).
6. Template CSV scaricabile con 2 righe di esempio demo- e docs/CATALOGO.md: descrizioni con parole proprie, mai copiate da altri siti; prezzi in loco e non dei partner; stagione in mesi; interessi dalla tabella interests; come preparare il file in Excel o Google Sheets.
```

### 1.2 Home

```
Passo 1.2 di docs/ROADMAP.md: home (nessun percorso sensibile).
Fatto quando:
1. Hero: desktop a due colonne (testo a sinistra, foto grande a destra); mobile con foto a tutta larghezza sopra e testo sotto, come HomeMobile. Nessun testo sopra la foto. Via la card "Esempio · Giorno 1" e la pillola dei punti. La foto è quella di un luogo in evidenza scelta a caso a ogni caricamento, senza didascalia (crediti in /crediti-foto); senza luoghi in evidenza, la copertina di is_home_hero o l'illustrazione dell'area. (Modifica di Ludovico del 14 ottobre: hero e carosello casuali, carosello più pulito senza barra visibile.) Foto hero in priority; LCP sotto 2,5 s su mobile in produzione.
2. Sezione "Dove andare in Sicilia" sotto l'hero: carosello orizzontale dei luoghi in evidenza (places.is_featured, featured_order, tagline_it). Card 4:5 con foto vera (mai illustrazione), nome, area e tagline se c'è; tutta la card è un link al luogo. Componente PlaceCard con README in docs/design/components e solo token.
3. Comportamento: scroll-snap, la card successiva sporge, frecce su desktop (44px, etichette accessibili), navigabile da tastiera, nessuno scorrimento automatico, prefers-reduced-motion rispettato. Su mobile scorrimento nativo.
4. La sezione compare solo con almeno 4 luoghi in evidenza con foto vera. Admin, scheda del luogo: "In evidenza", ordine, tagline, "Luogo dell'hero".
5. Seed demo (prefisso demo-): 10 luoghi in evidenza con questi nomi: Ortigia, Valle dei Templi, Etna, Scala dei Turchi, Taormina, Cefalù, Noto, Riserva dello Zingaro, Erice, Modica.
6. Sotto il carosello: "Itinerari pronti" (3 itinerari pubblicati con foto, durata e area) e la fascia "La voce locale" già esistente. Sostituisce la sezione "Tre passi" (docs/design/BACKLOG.md).
7. Annota in docs/design/mockups/README.md come Home.html e HomeMobile.html sono superati da questa PR.
```

### 1.3 Itinerari pronti: editor admin completo e pagina finale

```
Passo 1.3 di docs/ROADMAP.md: creazione finale degli itinerari pronti.
Obiettivo: l'admin crea e pubblica itinerari pronti curati (i "template") di qualità editoriale, e la pagina pubblica dell'itinerario è quella definitiva.
Fatto quando:
1. Admin > Itinerari: editor giorno per giorno con trascinamento (dnd-kit, accessibile da tastiera) e pulsanti su/giù; per ogni giorno titolo, introduzione breve (max 280 caratteri) e tappe (attività o luogo); per ogni tappa ora indicativa (mattina, pranzo, pomeriggio, sera) e nota facoltativa; dove dormire per notte (area o città, collegata alla verticale alloggi del passo 3.1).
2. Campi dell'itinerario: titolo, slug, sottotitolo, descrizione, durata (calcolata dai giorni), aree toccate (calcolate), stagione consigliata (mesi), adatto a (coppie, famiglie, amici, solo), ritmo, serve l'auto (calcolato dalle tappe), copertina (dalla catena di ripiego o scelta), budget indicativo al giorno calcolato dai prezzi in loco.
3. Controlli prima della pubblicazione, mostrati come elenco: almeno una tappa per giorno, tutte le attività attive, nessuna tappa fuori stagione rispetto ai mesi consigliati, nessun giorno che supera il tempo del ritmo scelto (stesso calcolo del motore), copertina vera, testo alternativo presente. Pubblicazione bloccata finché non passano.
4. Pagina pubblica /itinerari/[slug] definitiva: riepilogo in testa (giorni, aree, ritmo, auto, budget), DayTabs, mappa statica del percorso per giorno (passo 6.2 se già fatto, altrimenti segnaposto nascosto), tappe con foto, "Usa questo itinerario", condivisione (link copiato e Web Share API su mobile), dati strutturati TouristTrip per la SEO, versione stampabile (CSS print) senza navigazione.
5. Lista /itinerari con filtri per durata, area, adatto a, stagione; stato nell'URL come la lista attività.
6. Seed demo: 6 itinerari pronti demo- da 2, 3, 5 e 7 giorni su aree diverse.
```

### 1.4 Itinerary builder, seconda fetta

```
Passo 1.4 di docs/ROADMAP.md: M5 completa (seconda fetta del builder).
Fatto quando:
1. Trascinamento delle tappe tra posizioni e tra giorni (dnd-kit, tastiera e lettori di schermo supportati); su mobile restano i pulsanti su/giù più "Sposta a un altro giorno".
2. Aggiunta e rimozione di giorni, cambio delle date del viaggio con le tappe che restano sui giorni relativi.
3. Avviso per giorno quando la somma delle durate supera il tempo del ritmo, e quando due tappe consecutive sono in aree diverse (senza calcolo dei tempi finché non c'è il passo 1.5).
4. Note libere per giorno e per tappa (solo per chi possiede il viaggio e, dopo il passo 4.x, per i membri del gruppo).
5. Duplica viaggio, rinomina, elimina (con conferma); lista /viaggi con passati e futuri separati.
6. Esporta: file .ics con un evento per giorno (titolo del giorno e tappe nella descrizione) e PDF/stampa del viaggio. Link pubblico in sola lettura (token revocabile, noindex) per mostrarlo a chi non ha l'account.
7. E2E: un utente non apre né modifica il viaggio di un altro; il link pubblico revocato smette di funzionare; ospite → usa itinerario → registrazione con codice → il viaggio è ancora suo.
Percorso sensibile (RLS sul link pubblico): prova a rovescio.
```

### 1.5 Viaggi su due aree adiacenti (M4 parte 4)

Da fare dopo la Fase 3 (affiliati), come da spec.

```
Passo 1.5 di docs/ROADMAP.md: M4 parte 4, viaggi su due aree adiacenti (criteri in docs/coda-lavori.md, sezione 1b).
In più rispetto alla coda lavori:
1. I tempi di guida tra gli hub delle 8 aree li inserisco io dall'admin (28 coppie, minuti); finché la matrice è incompleta le coppie mancanti non si compongono.
2. Il giorno del trasferimento ha meno tempo disponibile (tempo del ritmo meno il tempo di guida) e lo dice nella pagina.
3. Il motivo della proposta spiega la combinazione ("Due zone vicine: 1 h 40 di strada tra le due").
4. Test Vitest deterministici: stesso profilo e catalogo → stesso viaggio; nessuna composizione oltre la soglia; la ripartizione dei giorni segue i punteggi delle due aree.
```

---

## Fase 2 — Voli

### 2.1 Barra di ricerca voli verso la Sicilia

[Decisione] Aeroporti di arrivo: la spec dice CTA, PMO, TPS, CIY. Vuoi anche Lampedusa (LMP) e Pantelleria (PNL)? Scrivilo nel prompt.

Percorso sensibile: redirect e tracciamento affiliati.

```
Passo 2.1 di docs/ROADMAP.md: barra di ricerca voli con destinazione Sicilia.
Obiettivo: chi pianifica trova un volo verso l'aeroporto siciliano giusto per il suo viaggio e prenota sul sito del partner, con il click tracciato.
Fatto quando:
1. Componente FlightSearch (README in docs/design/components, solo token) presente in: home (sotto l'hero, versione compatta), pagina /voli, pagina del viaggio (chip "Voli" della checklist), "Ecco tre viaggi".
2. Campi: partenza (autocompletamento su un elenco statico di aeroporti italiani ed europei con codice IATA, città e paese, file JSON nel repository con fonte dichiarata; cerca per città, nome o codice; tastiera e lettori di schermo supportati, schema combobox ARIA), arrivo (selettore con gli aeroporti siciliani: Catania CTA, Palermo PMO, Trapani TPS, Comiso CIY [più LMP e PNL se deciso]; predefinito: user_constraints.arrival_airport, altrimenti quello più vicino all'area del viaggio aperto), date di andata e ritorno (precompilate dalle date del viaggio), passeggeri (precompilati da itineraries.travelers), solo andata o andata e ritorno.
3. Pulsante "Scambia" disabilitato (la destinazione è sempre in Sicilia); se l'utente sceglie un aeroporto siciliano come partenza, messaggio chiaro.
4. Risultati da Travelpayouts Data API (prezzi in cache, non in tempo reale): per ogni aeroporto siciliano il prezzo più basso trovato, compagnia, scali, data di aggiornamento ("prezzo indicativo, aggiornato il ..."), calendario dei prezzi del mese. Cache lato server 6 ore per coppia di aeroporti e date (tabella flight_price_cache con RLS: lettura solo dal server). Il token dell'API solo in variabile d'ambiente.
5. "Vedi il volo" passa da /api/go/flight con parametri firmati HMAC dal server che ha generato il risultato; nessun URL arbitrario; click registrato in affiliate_clicks con contesto (home, voli, viaggio, chat) e subid. Test: firma alterata → 400; parametro di destinazione esterno → mai seguito; prova a rovescio sul controllo della firma.
6. Senza token o senza risultati: stato vuoto con link diretto (tracciato) alla ricerca del partner per quella coppia di aeroporti.
7. Pagina /voli e pagine SEO /voli/[citta-partenza]-[aeroporto-siciliano] solo per le 20 coppie più cercate (in configurazione), con metadati e sitemap; nessuna pagina senza prezzi veri.
8. Evento in user_events (flight_search) solo con consenso alla profilazione.
Togli "booking.partner-link" per i voli da src/lib/pending-actions.ts se coperto.
```

---

## Fase 3 — Affiliati su tutte le verticali

### 3.1 Link affiliati, alloggi e noleggi (M6)

Percorso sensibile.

```
Passo 3.1 di docs/ROADMAP.md: M6, affiliati su tutte le verticali. Criteri in docs/coda-lavori.md, sezione 3, più:
1. Partner e ID dalle iscrizioni che ho fatto (li metto io in .env.local e su Vercel): [elenco partner con nome variabile].
2. Chip della checklist del viaggio: "Scegli dove dormire" (alloggi nell'area della notte), "Confronta noleggi" (aeroporto di arrivo e date del viaggio), "Voli" (passo 2.1). Togli "proposal.car-rental" e "booking.partner-link" da src/lib/pending-actions.ts.
3. Riga di trasparenza vicino a ogni link: "Link affiliato: se prenoti, [partner] ci riconosce una commissione, a te non costa di più." Pagina /affiliazioni linkata dal footer.
4. Rate limit su /api/go (per IP e per utente) e test: nessun link senza subid, nessun redirect verso host fuori dall'allowlist dei partner.
```

### 3.2 Import automatico delle offerte dei partner

```
Passo 3.2 di docs/ROADMAP.md: import del catalogo dei partner (spec, "Import del catalogo attività").
Fatto quando:
1. Cron notturno import-catalog (vercel.json, isAuthorizedCron) per i partner con API attiva: upsert di activity_offers su (partner, partner_product_id); collegamento a un'attività esistente per somiglianza di nome e distanza (< 2 km), altrimenti attività nuova inattiva needs_review.
2. Tag proposti da un modello di fascia Haiku (Claude API) con forza 1-3, salvati come proposta; l'admin li conferma o li corregge nella coda "Da verificare". Nessuna attività attiva senza tag confermati.
3. Offerte non restituite per 3 import consecutivi → disattivate; l'attività resta.
4. Log di ogni import in una tabella con righe create, aggiornate, disattivate, errori; avviso in admin se un import fallisce due notti di fila.
5. Cron embed-activities: embedding (pgvector) per le attività nuove o modificate, provider in configurazione.
```

### 3.3 Conversioni e dashboard delle commissioni

```
Passo 3.3 di docs/ROADMAP.md: conversioni affiliate.
Fatto quando:
1. Import dei report partner: via API dove esiste (cron giornaliero), altrimenti CSV caricato dall'admin con anteprima; righe in affiliate_conversions collegate ai click tramite subid; idempotente.
2. Dashboard admin: click, conversioni, commissioni e tasso di conversione per periodo, contesto (pagina, itinerario, chat, voli), attività, partner; esportazione CSV.
3. Le conversioni senza click corrispondente si mostrano a parte (subid sconosciuto).
```

---

## Fase 4 — Gruppi (M8)

### 4.1 Creazione del gruppo e inviti

Percorso sensibile: RLS, ospiti.

```
Passo 4.1 di docs/ROADMAP.md: gruppi, creazione e inviti (spec, "Gruppi, inviti e voti").
Fatto quando:
1. "Viaggia in gruppo" dalla pagina del viaggio: crea il gruppo collegato all'itinerario; l'utente diventa owner. Nome del gruppo (max 60 caratteri).
2. Invito con link (7 giorni, fino a 10 usi, revocabile, rigenerabile) e via email (Resend, template nel design system); condivisione con Web Share API e "Copia link"; anteprima per WhatsApp (Open Graph con nome del gruppo e foto del viaggio, senza dati personali).
3. /invito/[token]: nome del gruppo, nome dell'owner, anteprima dell'itinerario anche senza account; registrazione con codice e onboarding dei gusti se mancano, poi ritorno all'invito. Token scaduto, revocato o esaurito: messaggio chiaro. Schermata progettata come da docs/design/BACKLOG.md, "Invito al gruppo dal lato di chi riceve il link".
4. accept_invite(token) SECURITY DEFINER: inserisce il membro, rifiuta ospiti (guest_not_allowed), token non validi (invite_expired, invite_exhausted, invite_revoked), membro già presente; massimo 30 membri.
5. Pagina del gruppo: membri con avatar e iniziali (nessun dato di preferenza), ruolo, uscita, rimozione da parte dell'owner, trasferimento della proprietà; l'owner non può uscire senza trasferirla.
6. pgTAP per ogni tabella: anonimo, proprietario, membro, ex membro, altro utente, admin, ospite. Un ex membro perde ogni accesso immediatamente.
7. Punti invite_accepted rimandati al passo 5.1 (marcatore in pending-actions se serve).
```

### 4.2 Voti, proposte e tempo reale

```
Passo 4.2 di docs/ROADMAP.md: voti e realtime nel viaggio di gruppo.
Fatto quando:
1. VoteButton su ogni tappa: +1 / -1, saldo visibile, il proprio voto evidenziato; i voti di chi esce non contano nel saldo.
2. Voci candidate alla sostituzione quando i voti contrari sono almeno la metà dei membri attuali: "2 su 4 preferirebbero altro. Ecco 2 alternative vicine." con alternative dallo scoring di gruppo; solo l'owner sostituisce.
3. Ogni membro può proporre un'aggiunta (attività + giorno); l'owner accetta o rifiuta; notifica in-app al proponente.
4. Supabase Realtime su itinerary_items e item_votes filtrato per itinerario: due sessioni aperte vedono le modifiche dell'altra entro 2 secondi (e2e con due contesti).
5. Registro delle modifiche del viaggio visibile ai membri ("Anna ha spostato Etna al giorno 3").
```

### 4.3 Scoring e proposte di gruppo

```
Passo 4.3 di docs/ROADMAP.md: preferenze aggregate del gruppo.
Fatto quando:
1. server/groups/aggregate.ts: vincoli (vince il più restrittivo) e pesi (media con minimo 2 per gli interessi a cui qualcuno ha dato 5), solo valori aggregati; nessuna API restituisce le preferenze di un altro membro (test).
2. "Ecco tre viaggi" per il gruppo, con motivi "Per il gruppo" solo aggregati; con meno di 3 membri solo motivi logistici (test).
3. Riepilogo del gruppo: "Interessi comuni" in forma aggregata, mai per persona.
```

---

## Fase 5 — Gamification (M9)

### 5.1 Punti, check-in e recensioni

Percorso sensibile: SECURITY DEFINER, anti-abuso, ospiti.

```
Passo 5.1 di docs/ROADMAP.md: M9 prima parte, punti, check-in e recensioni (spec, "Gamification e leaderboard").
Fatto quando:
1. Accrediti tramite public.award_points con ref_id univoco: profilo completato (50), invito accettato dopo l'onboarding dell'invitato (100, una volta per coppia), itinerario completato (100, almeno 3 check-in), recensione (20, almeno 80 caratteri), check-in (10, GPS entro 300 m, uno per luogo al giorno, massimo 5 al giorno). Valori in configurazione.
2. record_check_in e submit_review SECURITY DEFINER, utente da auth.uid(), mai da parametro; ospiti rifiutati (guest_not_allowed); insert diretto in reviews revocato. Test: un utente non fa check-in o recensioni a nome di un altro; la stessa azione due volte accredita una volta sola.
3. Check-in dalla pagina del viaggio: posizione chiesta solo al tocco del pulsante, con consenso esplicito e spiegazione; la posizione non si salva oltre la verifica (si salva solo esito, luogo e ora).
4. Recensioni: voto 1-5, testo, solo per attività presenti in un proprio itinerario o cliccate; etichetta "Recensione con premio" (public_reviews.rewarded); segnalazione di una recensione da parte degli utenti e coda di moderazione in admin (nascondi, ripristina, con voce nel registro admin).
5. Pagina "I miei punti": saldo, movimenti, prossimi badge; regolamento dei punti linkato (testo legale in sospeso finché non arriva).
6. Togli "home.points" da pending-actions e mostra i punti nella home per chi ha l'account.
```

### 5.2 Badge

```
Passo 5.2 di docs/ROADMAP.md: badge.
Fatto quando:
1. Criteri in badges.criteria valutati dal server dopo ogni assegnazione di punti: Primo viaggio, Esploratore dell'Etna, Nove su nove, Buongustaio, Organizzatore (spec), più quelli che decido in admin.
2. user_badges immutabile; assegnazione una volta sola (test).
3. Componente badge con illustrazione SVG o lettera (nessuna immagine generata), nome entro 16 caratteri per riga; notifica in-app al conseguimento con animazione che rispetta prefers-reduced-motion.
4. Admin: elenco badge, criteri, quanti utenti li hanno.
```

### 5.3 Classifiche

```
Passo 5.3 di docs/ROADMAP.md: leaderboard.
Fatto quando:
1. Classifica di gruppo nella pagina del gruppo: punti dei membri durante il viaggio del gruppo.
2. Classifica stagionale (estate aprile-settembre, inverno ottobre-marzo): primi 50 e posizione dell'utente; vista materializzata su points_ledger aggiornata ogni 15 minuti da cron; la vista non espone lo storico (test).
3. Opt-out dalla classifica stagionale nelle preferenze; nome mostrato = nome pubblico scelto dall'utente o iniziali, mai l'email.
4. Admin: chiusura della stagione con elenco dei primi 10 e stato del premio (assegnato, spedito); premio legato al regolamento (testo legale).
```

---

## Fase 6 — Design e rifinitura delle pagine

### 6.1 Passata di design sulle schermate esistenti

```
Passo 6.1 di docs/ROADMAP.md: passata di design.
Obiettivo: ogni pagina pubblica e dell'area utente rispetta mockup, schemi e manuale nei due temi, alle larghezze 390 e 1280.
Fatto quando:
1. Con npm run dev avviato, node scripts/design/compare-mockups.mjs per tutte le pagine con mockup; elenco delle differenze nella PR e correzione di quelle che non sono decisioni documentate.
2. Stati vuoti ed errore disegnati (docs/design/BACKLOG.md, "Schermate da progettare" punto 7): zero recensioni, consiglio scaduto, nessun viaggio, gruppo con un solo membro, nessun risultato di ricerca, errore di rete.
3. Skeleton di caricamento (loading.tsx) per le pagine con dati: nessun salto di layout (CLS < 0,1).
4. Microinterazioni: focus visibile ovunque, stati hover e premuto dei pulsanti dai token, transizioni brevi che rispettano prefers-reduced-motion.
5. Versione inglese: etichette maiuscole e stringhe lunghe non rompono i layout (screenshot nella PR).
6. Tema scuro verificato su tutte le schermate principali (BACKLOG punto 9).
Nessun confronto pixel per pixel: basta l'elenco delle differenze risolte.
```

### 6.2 Mappa

```
Passo 6.2 di docs/ROADMAP.md: mappa.
[Decisione: provider. Proposta: MapLibre GL con tile OpenFreeMap o MapTiler (gratuito fino a una soglia), stile con i colori dai token.]
Fatto quando:
1. Componente Map con marker numerati (componente del design system, README), stile dai token nei due temi, attribuzione dei dati mappa visibile.
2. Pagina del viaggio e dell'itinerario pronto: percorso del giorno selezionato con marker numerati come le tappe; su mobile mappa a scomparsa sotto le DayTabs.
3. Pagina del luogo: mappa con le attività vicine; lista attività: vista mappa facoltativa.
4. Caricamento pigro (solo quando la mappa entra nello schermo), nessun impatto sull'LCP; versione statica per la stampa.
5. Nessun cookie del provider di mappe prima del consenso, se il provider ne usa (verifica nella PR).
```

### 6.3 Identità: logo, favicon, email, anteprime social

```
Passo 6.3 di docs/ROADMAP.md: identità visiva applicata.
[Prerequisito: nome definitivo (Fase 0.1) e logo in SVG forniti da me in docs/design/brand/.]
Fatto quando:
1. Logo nel header e nel footer (SVG inline con colori dai token), favicon e icone PWA in tutte le misure, manifest con nome e colori dai token.
2. Template email unici (codice di accesso, cambio email, invito al gruppo, conferma ordine, spedizione, ordine al produttore, promemoria del viaggio): HTML compatibile con i client email, versione testo, tema chiaro, testi in messages; copia dei template di Supabase in supabase/templates.
3. Anteprime Open Graph 1200×630 generate (next/og) per luogo, attività, itinerario, prodotto, invito: foto vera, titolo, logo; nessun dato personale.
4. Template verticale 1080×1920 per i contenuti video (pagina admin che genera l'immagine di un itinerario o di un luogo).
```

---

## Fase 7 — Shop ed e-commerce (M10)

[Decisione] Prima di iniziare: vendi a nome tuo o come intermediario (Fase 0.2)? Spedizioni solo Italia o anche UE? Soglia di spedizione gratuita?

### 7.1 Produttori e prodotti

```
Passo 7.1 di docs/ROADMAP.md: catalogo dello shop.
Modello di vendita: [a nome mio | come intermediario]. Spedizioni: [Italia | Italia e UE].
Fatto quando:
1. Admin produttori: anagrafica (ragione sociale, partita IVA, contatti, indirizzo di spedizione, tempi di preparazione lead_time_days, zone servite, tariffe per zona, soglia di spedizione gratuita), storia del produttore (testo e foto con le regole di docs/IMMAGINI.md), stato attivo.
2. Admin prodotti: nome, slug, descrizione, prezzo IVA inclusa, aliquota IVA (4, 10 o 22%), formato e peso, ingredienti, allergeni evidenziati (Reg. UE 1169/2011), conservazione, scadenza minima garantita, deperibile sì/no (esclude il recesso, testo nelle condizioni), disponibilità (quantità o "su ordinazione"), foto multiple, collegamenti a luoghi e attività (il pistacchio porta a Bronte e viceversa), box composte da più prodotti.
3. Pagina /shop con filtri (categoria, produttore, area, prezzo), pagina prodotto con tutte le informazioni obbligatorie visibili prima dell'acquisto, dati strutturati Product, ProductCard del design system; pagina del produttore.
4. Nella pagina del luogo e dell'attività: "Dal territorio" con i prodotti collegati (solo se ci sono).
5. RLS: pubblico legge solo prodotti attivi di produttori attivi; i dati del produttore non pubblici (partita IVA, contatti) mai esposti. pgTAP.
6. Seed demo: 2 produttori e 8 prodotti demo-, bloccati da PRE_LAUNCH.
Togli "tabbar.shop" da pending-actions.
```

### 7.2 Carrello e checkout Stripe

Percorso sensibile: pagamenti.

```
Passo 7.2 di docs/ROADMAP.md: carrello e checkout.
Fatto quando:
1. Carrello in cookie firmato (HMAC), anche senza account; badge con il numero di articoli nella TabBar e nel header; drawer del carrello su desktop, pagina su mobile.
2. Spedizione calcolata per produttore presente nel carrello (tariffe per zona, soglia gratuita), mostrata prima del pagamento; avviso per i deperibili ("non si possono restituire") e per i tempi di preparazione.
3. Il server crea la sessione Stripe Checkout leggendo prezzi e disponibilità dal database, mai dal client; Stripe raccoglie indirizzo, email e telefono; paesi di spedizione limitati a quelli decisi; Stripe Tax o aliquote fisse per prodotto [decisione con il commercialista].
4. Uso dei punti per chi ha l'account: 100 punti = 1 euro, massimo 15% del totale; coupon Stripe monouso e riga redeem nel ledger nella stessa transazione; se la sessione scade, i punti tornano (redeem_refund).
5. Pagine di esito (successo, annullato) e checkout in modalità test di Stripe end-to-end in CI (Stripe CLI o mock del webhook firmato).
6. Prova a rovescio: un prezzo manomesso nel cookie non cambia l'importo addebitato.
```

### 7.3 Webhook, ordini, produttori, spedizioni

Percorso sensibile: webhook Stripe.

```
Passo 7.3 di docs/ROADMAP.md: ordini.
Fatto quando:
1. Webhook checkout.session.completed su src/app/api/stripe/**: verifica della firma, idempotenza su stripe_session_id (lo stesso webhook due volte crea un solo ordine, test), creazione di orders (stato paid) e order_items con il produttore di ciascun prodotto, scalo della disponibilità.
2. Email al cliente (conferma con riepilogo) e a ogni produttore (prodotti, indirizzo, link unico /produttore/spedizione/[token], valido fino alla spedizione); stato sent_to_producer.
3. Pagina del produttore: inserisce corriere e numero di tracking → stato shipped, email al cliente con il link di tracciamento.
4. Avviso all'admin se il produttore non conferma entro lead_time_days; delivered su conferma dell'admin o in automatico 10 giorni dopo la spedizione (cron); solo allora i punti (1 per euro) tramite award_points.
5. Area utente "I miei ordini" con stato e tracciamento; ordine senza account consultabile con link firmato nell'email.
6. Fattura o ricevuta: [integrazione con il servizio scelto con il commercialista, oppure solo dati esportabili in CSV per la prima versione].
7. orders con on delete set null sull'utente (obbligo fiscale); admin_audit_log per ogni cambio di stato manuale.
```

### 7.4 Rimborsi, resi e assistenza

Percorso sensibile.

```
Passo 7.4 di docs/ROADMAP.md: rimborsi e assistenza ordini.
Fatto quando:
1. Admin: rimborso totale o parziale dal pannello (API di Stripe), stato refunded o partially_refunded, punti usati restituiti (redeem_refund) e punti guadagnati revocati con una nuova riga; voce nel registro admin.
2. Webhook charge.refunded e charge.dispute.created gestiti (idempotenti), con avviso all'admin per le contestazioni.
3. Modulo "Problema con l'ordine" dall'area utente o dal link dell'email: motivo, foto facoltativa (bucket privato, RLS), messaggio all'admin e al produttore.
4. Pagina /condizioni-di-vendita linkata dal checkout (testo legale in sospeso finché non arriva).
```

---

## Fase 8 — Account, privacy e legale

### 8.1 Account, profilo pubblico, notifiche

```
Passo 8.1 di docs/ROADMAP.md: area account.
Fatto quando:
1. Pagina Account: nome pubblico (usato in gruppi e classifiche), avatar facoltativo (bucket privato con varianti, regole immagini), email (cambio con codice), lingua, tema (sistema, chiaro, scuro).
2. Preferenze di notifica: email per inviti, attività del gruppo, ordini (sempre attive per gli obblighi), promemoria del viaggio, newsletter (consenso esplicito separato, doppio opt-in, disiscrizione con un clic in ogni email).
3. Promemoria del viaggio (cron): 14 giorni prima ("Hai prenotato voli e alloggio?" con la checklist), 2 giorni prima (meteo non incluso, solo checklist), il giorno dopo il rientro ("Com'è andata?" con invito alla recensione).
4. Centro notifiche in-app (campanella) per gruppo, badge, ordini; letto/non letto.
```

### 8.2 Esportazione e cancellazione dei dati (GDPR)

Percorso sensibile: cancellazione dati.

```
Passo 8.2 di docs/ROADMAP.md: diritti sui dati.
Fatto quando:
1. "Scarica i miei dati": JSON (e CSV per i movimenti dei punti) con profilo, preferenze, viaggi, voti, recensioni, check-in, punti, ordini, consensi; generato dal server, link firmato valido 24 ore.
2. "Elimina l'account": conferma con codice email; cancellazione in cascata di dati personali e preferenze; orders e admin_audit_log restano con utente null (obblighi fiscali); recensioni anonimizzate ("Utente eliminato") o eliminate [decisione]; gruppi: proprietà trasferita al membro più vecchio o gruppo eliminato se vuoto; Stripe customer scollegato. Test di integrazione che verifica, tabella per tabella, cosa resta e cosa no.
3. Registro dei consensi (profilazione, posizione, dati sensibili, newsletter, cookie) con data e versione del testo; revoca da Account.
4. docs/PRIVACY-TECNICA.md: mappa di dati, finalità, conservazione e fornitori, utile al consulente per l'informativa.
```

### 8.3 Testi legali e pagine istituzionali

```
Passo 8.3 di docs/ROADMAP.md: testi legali e istituzionali.
[Prerequisito: testi forniti da me o dal consulente in docs/legali/*.md; mai scritti dall'agente.]
Fatto quando:
1. Pagine privacy, cookie, termini, condizioni di vendita, regolamento punti e classifica, politica delle recensioni, affiliazioni, crediti foto: contenuto dai file forniti, data di aggiornamento e versione, link nel footer e dove servono (checkout, iscrizione, recensioni, onboarding).
2. Chi siamo e pagina del fondatore con i testi forniti; pagine degli autori dei consigli locali (consenso scritto registrato).
3. Contatti: modulo con Turnstile, email di assistenza, ragione sociale e partita IVA nel footer.
4. Tolti da pending-actions tutti gli id "testi" e "legale". Le pagine prima in noindex entrano in sitemap.
```

---

## Fase 9 — Chatbot (M7)

```
Passo 9.1 di docs/ROADMAP.md: M7 chatbot (spec, "Chatbot AI").
Fatto quando:
1. /api/chat in streaming con gli strumenti della spec (get_user_profile, search_activities, get_activity, search_flights, propose_itinerary, get_itinerary, apply_itinerary_changes, suggest_preference_update, search_products), modelli e prompt caching come da spec; consultare la documentazione aggiornata della Claude API prima di scrivere codice.
2. Interfaccia: pannello chat dalla pagina del viaggio e pagina /chat; schede attività da [[activity:id]] con link /go tracciato; proposte di modifica all'itinerario con anteprima, Accetta o Rifiuta (BACKLOG, "Schermate da progettare" punto 4); stati di attesa ed errore.
3. Limite giornaliero di messaggi per utente (configurazione), ospiti con limite più basso; rate limit per IP; log di token in ingresso e uscita per sessione; admin AI con costo per giorno e per utente e ultime sessioni.
4. Valutazione automatica su 20 richieste di prova (file nel repository): ogni [[activity:id]] corrisponde a un id restituito da uno strumento nella stessa sessione; nessuna parola vietata del manuale; nessun URL scritto dal modello. Gira in CI su richiesta (non a ogni push, per i costi).
5. Gruppi: solo motivi aggregati, nessuno strumento restituisce le preferenze di un altro membro (test).
6. Difesa da prompt injection: i testi del catalogo e delle recensioni passati al modello sono marcati come dati; test con una recensione che contiene istruzioni.
```

---

## Fase 10 — Apprendimento e analisi (M11)

```
Passo 10.1 di docs/ROADMAP.md: M11.
Fatto quando:
1. Cron notturno dei pesi impliciti (tabella degli eventi della spec, decadimento 5%, limiti -2/+2) e dell'embedding del profilo; test: dopo una serie di eventi di prova i pesi cambiano nella direzione attesa e restano nei limiti.
2. Similarità coseno attiva nello scoring quando l'utente ha almeno 5 eventi (oggi vale 0).
3. Dashboard admin con i numeri che contano: utenti nuovi, ospiti convertiti in account, viaggi creati, viaggi con almeno un click affiliato, click e commissioni, ordini e valore medio, costo AI per utente attivo, inviti inviati e accettati. Periodo selezionabile, nessun dato personale.
```

---

## Fase 11 — Cose a cui non avevamo pensato

### 11.1 SEO e contenuti editoriali

```
Passo 11.1 di docs/ROADMAP.md: SEO.
Fatto quando:
1. Sitemap divise per tipo (luoghi, attività, itinerari, prodotti, voli, guide) con hreflang it/en, robots.txt, canonical su tutte le pagine filtrate.
2. Dati strutturati: TouristAttraction (attività), Place (luoghi), TouristTrip (itinerari), Product e Organization, BreadcrumbList; validati con un test sullo schema.
3. Sezione /guide: articoli editoriali scritti da me (Markdown o editor admin), con autore, data, foto con crediti, collegamenti a luoghi, attività e prodotti; nessun articolo generato.
4. Pagine di area (/sicilia/[area]) con descrizione, luoghi, attività migliori, itinerari e prodotti dell'area.
5. Link interni: "Vicino a qui", "Nello stesso itinerario", "Dal territorio".
6. Search Console e Bing Webmaster: istruzioni in docs/LANCIO.md (verifica del dominio con record DNS).
```

### 11.2 Ricerca interna del sito

```
Passo 11.2 di docs/ROADMAP.md: barra di ricerca del sito.
Fatto quando:
1. Ricerca unica (header su desktop, icona su mobile) su luoghi, attività, itinerari, prodotti e guide: full-text Postgres con dizionario italiano e unaccent, tolleranza agli errori (pg_trgm), risultati raggruppati per tipo.
2. Suggerimenti mentre si scrive (debounce, tastiera, ARIA combobox), pagina /cerca?q= con risultati completi, stato vuoto con proposte.
3. Le ricerche senza risultati si registrano in forma anonima per l'admin (cosa manca nel catalogo).
```

### 11.3 PWA e uso in viaggio

```
Passo 11.3 di docs/ROADMAP.md: il sito come app in viaggio.
Fatto quando:
1. Manifest e service worker (installabile): il viaggio aperto di recente resta consultabile offline (tappe, indirizzi, note, checklist), con avviso "sei offline".
2. "Oggi" nella pagina del viaggio durante le date del viaggio: tappe del giorno, apri in Google Maps / Apple Maps (link con coordinate), check-in.
3. Invito all'installazione mostrato solo dopo il secondo viaggio salvato, mai al primo accesso.
4. Comportamento corretto nei browser interni di Instagram, TikTok e Facebook (già rilevati): nessun vicolo cieco su login, pagamenti, condivisione.
```

### 11.4 Accessibilità

```
Passo 11.4 di docs/ROADMAP.md: audit di accessibilità (WCAG 2.2 AA; l'European Accessibility Act si applica ai servizi di e-commerce dal 28 giugno 2025).
Fatto quando:
1. axe-core nei test e2e sulle pagine principali, zero violazioni serie o critiche.
2. Navigazione completa da tastiera di onboarding, builder, checkout, chat; ordine del focus e trappole di focus nei dialog verificati.
3. Lettore di schermo (VoiceOver o NVDA) sui flussi principali: annunci di stato per aggiunte al carrello, voti, salvataggi.
4. Dichiarazione di accessibilità pubblicata (pagina, linkata dal footer).
```

### 11.5 Sicurezza, monitoraggio, backup

Percorso sensibile.

```
Passo 11.5 di docs/ROADMAP.md: sicurezza e operatività.
Fatto quando:
1. Header di sicurezza (Content-Security-Policy con nonce, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy con geolocation solo self) e test che li verifica.
2. Rate limit su tutte le azioni pubbliche (accesso, ospiti, inviti, recensioni, contatti, chat, /api/go) con Upstash o tabella Postgres; risposte 429 con messaggio.
3. Sentry su server e client senza dati personali (scrub di email e token), con release e sourcemap; avvisi su errori nuovi.
4. Uptime check (homepage, /api/health con controllo del database) ogni 5 minuti con avviso via email.
5. Backup: piano Supabase con backup giornalieri e PITR; prova di ripristino documentata in docs/LANCIO.md.
6. npm audit e Dependabot settimanale; secret scanning attivo sul repository.
7. Revisione di sicurezza completa (/security-review) su auth, RLS, webhook, redirect, upload; i risultati confermati diventano PR separate.
```

### 11.6 Ambiente di staging e dati reali

```
Passo 11.6 di docs/ROADMAP.md: staging.
Fatto quando:
1. Progetto Supabase di staging e deploy di preview Vercel collegato (variabili separate, chiavi di prova di Stripe e Turnstile), migrazioni applicate in CI su staging a ogni merge su main.
2. Script per copiare in staging il catalogo di produzione senza dati personali, per provare le modifiche con i dati veri.
3. docs/LANCIO.md aggiornato con il flusso: PR → preview → staging → produzione.
```

### 11.7 Analytics rispettosi della privacy

```
Passo 11.7 di docs/ROADMAP.md: analytics.
[Decisione: Plausible o Umami (senza cookie, nessun consenso necessario) oppure GA4 (con consenso).]
Fatto quando:
1. Strumento scelto installato senza cookie non tecnici prima del consenso (test e2e che conta i cookie).
2. Eventi chiave: onboarding completato, viaggio salvato, click affiliato (contesto), invito inviato e accettato, aggiunta al carrello, ordine completato, ricerca voli.
3. Funnel nella dashboard dello strumento documentato in docs/LANCIO.md.
```

### 11.8 Performance

```
Passo 11.8 di docs/ROADMAP.md: M12 performance (docs/design/BACKLOG.md, Milestone 12).
Fatto quando:
1. Fraunces come istanza fissa (fontTools) con next/font/local, subset latin.
2. Lighthouse mobile sopra 90 su home, attività, itinerario pronto, prodotto, misurato in CI (Lighthouse CI su build di produzione) con soglia che fa fallire il job.
3. Immagini: priority solo sulla LCP, sizes corretti, varianti AVIF servite con cache lunga; nessun JavaScript client non necessario nelle pagine pubbliche (bundle analizzato nella PR).
4. Cache delle pagine pubbliche con revalidate e invalidazione dall'admin al salvataggio.
```

### 11.9 Versione inglese

```
Passo 11.9 di docs/ROADMAP.md: inglese completo.
Fatto quando:
1. Tutti i testi dell'interfaccia in messages/en.json rivisti (nessuna chiave mancante: test che confronta le chiavi delle due lingue).
2. Contenuti del catalogo: campi _en per luoghi, attività, itinerari, prodotti; se manca la traduzione la pagina inglese mostra l'italiano con l'indicazione "Disponibile in italiano" e non entra nella sitemap inglese.
3. Admin: indicatore delle traduzioni mancanti per tipo.
4. Prezzi sempre in euro; date e numeri formattati per lingua.
```

---

## Fase 12 — Prima del lancio

### 12.1 Inserimento del catalogo reale [Tu, con l'admin]

1. `npm run supabase:push-production` e migrazioni in produzione (mai il seed).
2. Import del CSV reale (passo 1.1), revisione della coda "Da verificare", tag confermati.
3. Foto: Immagini → Foto da Commons con la casella CC BY-SA spuntata solo se la licenza è valutata; rileggi didascalie e autori; carica a mano le foto proprie.
4. Itinerari pronti: almeno 10, pubblicati con i controlli del passo 1.3.
5. Offerte affiliate per le attività principali; produttori e prodotti con informazioni obbligatorie complete.
6. Consigli locali con consenso registrato.

### 12.2 Controllo di lancio automatico

```
Passo 12.2 di docs/ROADMAP.md: controlli di lancio completi.
Fatto quando:
1. e2e/launch.spec.ts esteso con i controlli delle fasi successive: Stripe in modalità live sulla produzione e webhook registrato (endpoint e firma), Resend con dominio verificato (SPF, DKIM, DMARC: test via DNS), chiave Anthropic presente con limite giornaliero in configurazione, ID dei partner presenti, Sentry attivo, nessun prodotto senza allergeni e informazioni obbligatorie, nessun produttore senza accordo registrato (campo data accordo), testi legali presenti con versione, sitemap raggiungibile, robots.txt che non blocca il sito, header di sicurezza presenti.
2. Elenco di pending-actions vuoto con PRE_LAUNCH=1.
3. docs/LANCIO.md aggiornato con ogni voce, il suo valore e come verificarla, come oggi.
```

### 12.3 Beta chiusa [Tu]

1. 20-30 persone vere (amici, famiglie, un paio di gruppi): ognuna crea un viaggio, invita qualcuno, fa un ordine piccolo con un codice sconto.
2. Raccogli i problemi in una lista; ogni problema diventa un prompt breve: "Passo 12.3, correzione: [descrizione, pagina, passi per riprodurlo, screenshot]".
3. Misura: quanti completano l'onboarding, quanti salvano un viaggio, quanti cliccano un link affiliato, quanti accettano un invito.

### 12.4 Lancio

```
Passo 12.4 di docs/ROADMAP.md: giorno del lancio.
Fatto quando:
1. Controllo di lancio (passo 12.2) verde sulla produzione: incolla nella PR il conteggio dei test dai log.
2. Smoke test e2e sulla produzione in sola lettura (home, luogo, attività, itinerario, voli, shop, accesso con codice) senza scrivere dati.
3. Rimozione di ogni noindex di pre-lancio; sitemap inviata a Search Console.
4. Piano di rollback documentato: deploy precedente su Vercel, migrazioni compatibili all'indietro, come disattivare lo shop o il chatbot con una variabile d'ambiente (interruttori già presenti: aggiungerli se mancano).
```

---

## Fase 13 — Dopo il lancio (prime 4 settimane)

- **Settimana 1:** errori in Sentry ogni giorno, costo AI per utente, email non consegnate, ordini in ritardo dai produttori. Prompt brevi di correzione.
- **Settimana 2:** primi report dei partner importati (passo 3.3): quali pagine portano commissioni? Le pagine che non portano nulla si migliorano o si tolgono dalla home.
- **Settimana 3:** ricerche senza risultati (passo 11.2) → nuove attività nel catalogo.
- **Settimana 4:** prima newsletter (solo iscritti con doppio opt-in), primo contenuto video con il template del passo 6.3, decisione se il chatbot resta gratuito in base al costo per utente attivo.

### Idee per dopo (non prima del lancio)

- Viaggi su tre o più aree, isole minori (Eolie, Egadi, Pantelleria, Lampedusa) con traghetti e aliscafi affiliati.
- Eventi e sagre per data (calendario), con import da fonti con licenza.
- Abbonamento "Isula+" (chatbot illimitato, itinerari premium) se i numeri lo giustificano.
- App nativa solo se la PWA non basta (notifiche push su iOS già supportate dalla PWA installata).
- Programma per guide e strutture locali che pubblicano le proprie offerte (marketplace), con verifica e contratti.
