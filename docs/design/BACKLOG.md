# Backlog di design e contenuti

Lavoro deciso ma rimandato. Aggiornare questo file quando una voce viene fatta o cambia.

## Milestone 12 (rifinitura e performance)

- **Fraunces come istanza fissa:** con fontTools, `fonttools varLib.instancer Fraunces.ttf SOFT=50 WONK=0 wght=600`, tenendo solo `opsz` variabile; subset latin; caricamento con `next/font/local`. Oggi `next/font/google` scarica gli interi intervalli degli assi.
- Verifica di `text-wrap: balance` sui browser di riferimento, con alternativa accettabile dove manca.
- Lighthouse mobile sopra 90 su home, attività, itinerario pronto, prodotto.

## Schermate da progettare

1. Onboarding completo: domande 1 e 3-6, schermata "Ecco tre viaggi".
2. Destinazioni dei chip dell'itinerario: "Scegli dove dormire" e "Confronta noleggi".
3. Invito al gruppo dal lato di chi riceve il link.
4. Chatbot: proposta di modifica all'itinerario con anteprima, Accetta o Rifiuta; stati di attesa ed errore.
5. Shop: pagina prodotto, carrello, checkout con uso dei punti, avviso per i deperibili, tracciamento ordine, pagina produttore.
6. Variante anonima della scheda attività ("Dicci cosa ami e ti diciamo se fa per te").
7. Stati vuoti ed errore disegnati: zero recensioni, consiglio scaduto, nessun viaggio, gruppo con un solo membro.
8. Pagine "Chi siamo" e autori, profilo e preferenze, pagine legali (regolamento punti, politica recensioni, affiliazioni, cookie).
9. Mockup in tema scuro delle schermate principali.

## Design system

- Home desktop: sostituire "Tre passi" con un itinerario di esempio da scorrere; hero a foto piena.
- Stile della mappa (provider e palette dai token) e marker numerati come componente.
- Anteprime di condivisione 1200×630 e template verticale per i video.
- Logo, favicon, template email.
- Verifica della versione inglese: etichette maiuscole e timbri con stringhe più lunghe.

## Contenuti (a carico di Ludovico)

- Foto reali: servizio fotografico o accordi con fotografi locali.
- Consigli locali scritti e verificati per le attività del catalogo iniziale.
- Ricerca di collaboratori locali reali, uno per provincia, con consenso scritto.
- Nomi dei badge entro 16 caratteri per riga.

## Decisioni aperte

- Nome definitivo: verifica di dominio e marchio per "Isula".
- Punti per le recensioni (con etichetta) oppure per il check-in con foto.
