# Schemi e casi da non dimenticare

Le regole per le situazioni che non stanno in un singolo componente ma decidono se il prodotto sembra curato o improvvisato.

## Stati di ogni schermata

Ogni vista che carica dati ha quattro stati progettati, non uno:

- **Caricamento:** scheletri `calce-sunk` con la forma del contenuto finale.
- **Vuoto:** una frase che dice cosa fare, un'azione principale. "Non hai ancora un viaggio. Rispondi a 6 domande e te ne proponiamo tre." Mai "Nessun risultato" da solo.
- **Errore:** cosa è successo in parole semplici, cosa fare, un pulsante per riprovare. Colore `danger` solo per l'icona e il titolo.
- **Pieno:** il design dei mockup.

## Fiducia e trasparenza

- **Link affiliati:** ogni offerta è un `AffiliateOffer` con il nome del partner, e la riga `caption`: "Prenoti sul sito di GetYourGuide. Riceviamo una commissione, il prezzo per te non cambia." Mai "sito del partner" senza nome.
- **Prezzi:** "da 35 €" per i prezzi indicativi; i voli portano sempre "aggiornato 2 ore fa".
- **Il perché:** la riga "Per te" su ogni suggerimento personalizzato; un link "Cambia preferenze" nelle pagine di risultati.
- **Recensioni:** mostrano nome e avatar, "Ha fatto questa attività" quando è verificata, e sempre l'etichetta "Recensione con premio", perché chi recensisce riceve punti. La pagina Recensioni spiega il meccanismo; il premio non dipende dal voto dato.
- **Voce locale:** i consigli in `LocalTip` hanno firma (redazione o persona reale), relazione con il luogo per le firme personali, e data dell'ultima verifica. Mai autori inventati. Un consiglio non riverificato da 12 mesi esce dalle pagine pubbliche, ma non sparisce in silenzio: 30 giorni prima della scadenza compare nella coda "Da riverificare" dell'admin.

## Formati

- Date: "sab 14 giugno", orari "9:30". Durate "2 h 30 min". Distanze "12 km · 20 min in auto".
- Numeri all'italiana: "1.240 punti", "35,50 €" con il simbolo dopo, separato da uno spazio.
- In inglese: "Sat 14 June", "€35.50".

## Onboarding delle preferenze

Una domanda per schermata, 6-8 schermate, barra di avanzamento in `lava`. Ogni schermata si può saltare. Gli interessi si scelgono con i chip; l'intensità con la scala da 0 a 5. Alla fine, prima del risultato: "Ecco tre viaggi pensati per te", non una schermata di congratulazioni.

**Gusti e viaggio sono due cose diverse.** I gusti valgono per tutti i viaggi: interessi con il loro peso, ritmo, tolleranza a caldo e folla, mobilità e dieta. Il viaggio è di questa volta: giorni, periodo, con chi, aeroporto, budget e auto.

- La prima volta "Crea il tuo viaggio" è il percorso completo, una domanda per schermata. Chi ha già i gusti trova una sola schermata, "Il tuo prossimo viaggio", con gli ultimi valori del viaggio già compilati e sopra il riepilogo dei gusti con "Modifica i gusti".
- Preferenze contiene solo i gusti, e lo dice: valgono per tutti i tuoi viaggi.
- "Ecco tre viaggi" offre due strade distinte: "Cambia il viaggio" e "Modifica i tuoi gusti".
- Un solo pulsante principale in home, "Crea il tuo viaggio"; Preferenze sta nel menu utente.
- **Gruppi:** si aggregano solo i gusti dei membri. Date e persone sono del viaggio del gruppo, non di ciascun membro.

## Prenotazioni: niente promesse impossibili

Con i link affiliati ogni attività si prenota sul sito di un partner diverso, e non riceviamo conferma. Quindi:

- Nessun bottone "Prenota tutto". Nell'itinerario c'è "Da prenotare", che apre una checklist: ogni voce con la casella da 44px per segnarla come prenotata (`aria-label="Segna come prenotato"`), il partner e il bottone verso il partner. Il conteggio usa sempre la stessa formula ovunque: "3 da prenotare · 1 fatto".
- Il selettore "Aggiungi al viaggio" propone per default il giorno geograficamente compatibile. Se il viaggio attivo è lontano, lo dice: "A 4 h dalla tua base di Noto".
- Base e mezzo del viaggio sono punti di prenotazione, non testo: il chip "Base a Noto" apre "Scegli dove dormire", il chip "In auto" apre "Confronta noleggi".
- Nella scheda attività "Aggiungi al viaggio" resta l'azione principale; l'`AffiliateOffer` ha lo stesso peso visivo ma stile secondario.
- Prezzi non affiliabili (un biglietto d'ingresso pagato in loco) sono metadati, non prezzi protagonisti.

## Arrivi dai social: browser interni delle app

Chi arriva da TikTok o Instagram apre le pagine nel browser interno dell'app. Lì Google blocca l'accesso con OAuth, e un link via email si apre in un altro browser, dove la sessione non serve. Quindi:

- **Si usa senza account:** creare, salvare e modificare un itinerario funziona come ospite. L'account si crea dopo e riceve i dati dell'ospite.
- **Accesso con codice a 6 cifre via email**, digitato nella stessa pagina. Il link magico resta solo come alternativa.
- **Google nascosto nei browser interni**, con l'invito "Apri nel browser" per chi lo vuole usare.
- **Un solo percorso di conversione** nelle pagine di atterraggio: "Usa questo itinerario" chiede date e persone, salva, e solo dopo propone "Vuoi adattarlo ai tuoi gusti? 6 domande".
- **Intestazione delle pagine di atterraggio:** logo sempre a sinistra; freccia indietro solo se c'è una cronologia di navigazione.
- **Variante anonima** di ogni scheda: senza "Perché è per te", con l'invito "Dicci cosa ami e ti diciamo se fa per te".

## Navigazione mobile

- Barra inferiore a 4 voci: Esplora, Viaggi, Gruppi, Profilo (Shop torna con il passo 7). Su desktop: header con Esplora, Voli, Dove dormire e il menu personale dall'avatar (viaggi, gruppi, punti, classifica, notifiche, preferenze, profilo). Etichette sempre visibili, icona 24px, area 56px, `env(safe-area-inset-bottom)` sotto.
- La barra del chatbot sta sopra la barra inferiore, solo nelle schermate di itinerario. Quando la barra chat ha il focus, la barra inferiore si nasconde per lasciare spazio alla tastiera.
- Nella scheda attività la barra inferiore lascia il posto a una barra fissa con "Aggiungi al viaggio" e l'offerta affiliata principale.
- Schede dei giorni scorrevoli in orizzontale, con il nome del giorno: "G1 · Noto e costa".
- Testi lunghi troncati a due righe con `line-clamp`, mai riscritti in una versione breve.
- Le pagine di atterraggio dai video (itinerario pronto, luogo, attività) si progettano prima in versione mobile.

## Condivisione

Ogni itinerario pronto, attività e luogo ha un'immagine di anteprima (1200×630) generata: foto, titolo in Fraunces, la linea del percorso con le tappe, la parola Isula. Gli itinerari di gruppo condivisi con un invito mostrano "Ti hanno invitato a: Val di Noto in 4 giorni".

## Gamification, con misura

- I punti compaiono dove li guadagni e nella pillola dell'intestazione, non in ogni pagina.
- La classifica mostra prima il gruppo, poi la stagione. Nell'itinerario sta sotto le tappe e sotto "Da prenotare", mai sopra la piega.
- Voti con icone pollice su e pollice giù più il numero, `aria-pressed` sul proprio voto; mai solo colore. Quando i voti contrari sono almeno la metà dei membri attuali del gruppo, la tappa lo dice così: "2 su 4 preferirebbero altro". Chi è in fondo vede la distanza dal prossimo ("ti mancano 40 punti per salire"), non la propria posizione in rosso.
- Nessuna notifica push per i punti. Email solo per inviti, ordini e un riepilogo a fine viaggio.

## Tema scuro

Tutti i token hanno il valore scuro. Le foto non si scuriscono; i segnaposto sì. Il tema segue il sistema, con una scelta manuale nelle impostazioni.

## Oltre il sito

- **Email:** sfondo `calce`, testo `lava`, un solo pulsante `coccio`, larghezza 600px, Fraunces solo nel titolo con Georgia come alternativa.
- **Video e social:** titoli in Fraunces, sottopancia in Instrument Sans su fascia `lava` con testo `calce`, la linea del percorso come transizione tra le tappe. Formato verticale con margini di sicurezza di 120px in alto e in basso.
- **Packaging della box:** carta naturale, stampa a un colore `coccio`, la parola Isula in Fraunces. Da sviluppare con il logo.

## Da fare prima del lancio

- Scelta definitiva del nome e verifica di dominio e marchio.
- Logo e simbolo: il marchio attuale è solo testuale.
- Servizio fotografico o accordi con fotografi locali: il design regge solo con foto vere.
- Illustrazioni per gli stati vuoti, se si decide di usarle.
