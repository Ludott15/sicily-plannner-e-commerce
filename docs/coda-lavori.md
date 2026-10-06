# Coda dei lavori (6 ottobre 2026)

Criteri completi dei lavori in coda, dati da Ludovico. Ordine: parte 3 della M4, poi M5, poi M6. Ogni lavoro segue "Modo di lavoro" di `CLAUDE.md`: PR verde su percorso non sensibile, si passa al successivo; percorso sensibile, ci si ferma con il resoconto e i conteggi dai log.

Decisione del 6 ottobre sulla dieta: è una preferenza, non una garanzia. Il filtro resta, i testi dicono che l'indicazione è indicativa (vedi punto 8 della parte 3).

## 1. Parte 3: proposte diverse e geograficamente coerenti (M4)

Diagnosi già fatta: le "zone" sono province, non aree di viaggio, e la classifica somma le attività migliori, premiando le province con più attività nel catalogo (con il seed vincono sempre PA, CT, TP, SR).

Fatto quando:

1. Tabella `areas` (slug, nome it/en, ordine) e `places.area_id`; seed con 8 aree: Palermo e dintorni, Costa nord e Madonie, Ovest, Agrigentino, Interno, Etna e costa ionica, Siracusano, Barocco ibleo. Admin: assegnazione dell'area ai luoghi. Migrazione, RLS (lettura pubblica, scrittura admin), pgTAP.
2. Il motore compone il miglior viaggio per ogni area idonea. Punteggio d'area = media dei punteggi dei giorni migliori composti (tanti giorni quanti scelti), non somma. Idonea: attività sufficienti per i giorni scelti al ritmo scelto (soglia in configurazione). Sceglie i tre viaggi con vincolo di diversità: con almeno 3 aree idonee, tre aree diverse; altrimenti varianti della stessa area con interesse principale diverso, dichiarato nel motivo ("Pochi viaggi in più zone per i giorni scelti").
3. Aeroporto: piccolo bonus di vicinanza che rompe la parità; con "Non lo so ancora" nessun effetto.
4. Ogni proposta dice perché quest'area, con motivi veri, mai generici.
5. Test unitari con profili e cataloghi fissi: area diversa per proposta con tre aree idonee; un'area senza attività sufficienti non compare mai; deterministico con il catalogo in ordine diverso; i profili "mare", "storia", "natura" e "cibo e vino" producono set di aree diversi.
6. Seed demo (prefisso `demo-`): almeno 6 aree con almeno 6 attività ciascuna.
7. Admin "Copertura del catalogo": per area, attività attive, con tag, con offerta, con consiglio locale, e idoneità per 3, 5 e 7 giorni.
8. Dieta come preferenza e non come garanzia: sotto le attività filtrate per dieta la riga "Indicativo: conferma sempre con chi organizza"; nell'admin il campo diete adatte dice "da confermare con il fornitore".
9. Link "Preferenze" nel menu utente e nella schermata "Ecco tre viaggi".

Fuori scope (annotati in `docs/spec.md`): distanze tra le tappe, viaggi su due aree, isole minori.

Percorso sensibile solo per la migrazione: prova a rovescio sulla RLS.

## 1b. M4 parte 4: viaggi su due aree adiacenti (dopo la M6)

Da fare dopo la M6. Oggi un viaggio sta dentro una sola area; se nessuna area copre i giorni scelti, la pagina mostra i viaggi sul massimo di giorni coperto (decisione del 6 ottobre).

Fatto quando:

1. Matrice dei tempi di guida tra gli hub delle 8 aree (28 coppie), compilabile dall'admin; i valori li fornisce Ludovico.
2. Un viaggio può comporsi di due aree adiacenti, con i giorni ripartiti tra le due e un trasferimento tra loro.
3. Nessuna composizione oltre una soglia di tempo di guida (in configurazione).

## 2. Itinerary builder, prima fetta (M5)

Obiettivo: i viaggi si salvano, si aprono e si modificano.

Fatto quando:

1. "Usa questo itinerario" e "Salva questo viaggio" (da "Ecco tre viaggi") creano un itinerario dell'utente, anche ospite, con i titoli dei giorni ereditati. Date e numero di persone si chiedono in quel momento.
2. Pagina del viaggio come `docs/design/mockups/Itinerario.html` e `ItinerarioMobile.html`, senza le parti di gruppo: DayTabs, linea del percorso, tappe, rimozione, riordino (pulsanti su/giù su mobile).
3. "Aggiungi al viaggio" nella scheda attività, con selettore che propone il giorno compatibile per zona e avvisa se il viaggio è lontano.
4. `itinerary_bookings` e checklist "Da prenotare" con casella da 44px e conteggio "N da prenotare · M fatto". I link ai partner restano in sospeso fino alla M6.
5. `user_events` (`add_to_itinerary`, `remove_from_itinerary`) registrati, in sola scrittura.
6. E2E completo dall'interfaccia, come nei criteri della M5: ospite, usa itinerario, registrazione con codice, itinerario ancora suo.

Percorso sensibile (nuova tabella con RLS): prova a rovescio sulle policy.

## 3. Affiliati su tutte le verticali (M6)

Obiettivo: ogni punto di prenotazione del sito (attività, guide, alloggi, voli, noleggi) porta a un link affiliato reale e tracciato.

Fatto quando:

1. `server/affiliates/links.ts`: generatore di link per partner con subid, con ID partner e template URL da configurazione (env e tabella), non nel codice. Aggiungere un partner è una configurazione. Test: nessun link senza subid, nessun URL di destinazione arbitrario. Partner iniziali: quelli di Travelpayouts.
2. Pagine di verticale, con i componenti del design system e senza testi inventati: "Dove dormire" per zona e città (hotel, ostelli, B&B); "Noleggio auto" per aeroporto (CTA, PMO, TPS, CIY), più scooter e bici dove il partner li offre; "Voli per la Sicilia", con prezzi in cache 6 ore e data di aggiornamento. Sono le destinazioni dei chip dell'itinerario, entrano in sitemap e hanno metadati SEO.
3. Admin delle offerte: creazione di `activity_offers` con link vero e subid, per attività e guide. L'import automatico dei partner con API non è in questa PR.
4. `/api/go` registra il click per tutte le verticali (`offer_id` nullable come da schema) e nomina il partner nella riga di trasparenza.
5. ID partner da variabili d'ambiente. Senza ID, le verticali mostrano "in arrivo" e bloccano `PRE_LAUNCH`.

Percorso sensibile (redirect e tracciamento): rigore pieno, prova a rovescio sul controllo dell'URL.
