# Isula

La Sicilia di chi ci vive, su misura per te.

Isula (in siciliano: isola) è un planner di viaggi in Sicilia e uno shop di prodotti spediti dai produttori, sotto un unico brand. "Isula" è un nome di lavoro: dominio e marchio sono da verificare prima del lancio. Non esiste ancora un logo; fino ad allora il marchio è la parola **Isula** composta in Fraunces 600 con colore `lava`.

## Cosa promettiamo

Quattro principi. Ogni schermata, testo e video deve rispettarne almeno uno e non contraddirne nessuno.

1. **Locale, e si vede chi lo dice.** Ogni consiglio locale ha una firma vera. Al lancio la voce è quella della redazione di Isula, cioè del fondatore Ludovico, che vive in Sicilia: firma "Redazione di Isula", con una pagina "Chi siamo" con nome e volto. Quando una persona ha un legame reale con un luogo, firma lei con il proprio nome e la relazione ("ci va ogni estate da 15 anni", "ha lavorato due stagioni alla tonnara"). I collaboratori locali sono persone reali che esistono, confermano il testo e firmano con il loro nome. **Mai autori inventati o firme di persone che non esistono.** "Verificato" si scrive solo se qualcuno ha davvero verificato quel fatto, alla data indicata.
2. **Su misura, in modo trasparente.** Ogni proposta dice perché è per te ("Ami la natura · 35 min dalla tua base"). Nei viaggi di gruppo il motivo è aggregato e non espone mai le preferenze dei singoli, che restano private.
3. **Da vivere e da portare a casa.** Il viaggio e i prodotti sono la stessa storia: il pistacchio della gita a Bronte arriva a casa in una box. Lo shop segue la pianificazione, non la interrompe.
4. **Meglio insieme.** Gruppi, voti e timbri rendono il viaggio una collezione condivisa. Il tono è da compagnia di amici, non da videogioco: niente coriandoli, niente mascotte.

## Voce e contenuti

Parliamo come un amico siciliano che ti organizza la gita: diretto, caldo, preciso. Del "tu", frasi brevi, nomi di luoghi e piatti al posto degli aggettivi.

| Sì | No |
| --- | --- |
| "Arriva prima delle 10: dopo, il parcheggio è pieno." (se verificato) | "Una perla incantevole da non perdere!" |
| "Granita di mandorla e brioche col tuppo, la colazione di Catania." | "Deliziose specialità locali." |
| "3 giorni, 2 ore di auto in totale." | "Un itinerario perfetto per tutti." |
| "Ti manca un check-in per il timbro Nove su nove." | "Complimenti!!! Sei fantastico! 🎉" |

Regole:

- **Vietati:** "magico", "incantevole", "perla", "da non perdere", "autentico" usato da solo, punti esclamativi multipli, emoji nell'interfaccia. Vale anche per le risposte del chatbot.
- **Consigli generici** ("porta l'acqua", "scarpe comode") stanno nella sezione "Da sapere", in piccolo. Non sono il nostro valore e non si presentano come tali.
- **Numeri concreti:** durate, distanze, orari, prezzi. "da 35 €" quando il prezzo è indicativo; i voli portano sempre la data di aggiornamento.
- **Parole siciliane:** poche, spiegate la prima volta ("arancina, la palla di riso fritta").
- **Link affiliati:** dichiarati accanto a ogni offerta, con il nome del partner.
- **Recensioni con premio:** chi recensisce riceve punti, quindi ogni recensione porta l'etichetta "Recensione con premio", e la pagina Recensioni spiega come funziona.
- **Bilingue:** italiano e inglese. In inglese i nomi di piatti e luoghi restano in italiano, in corsivo alla prima occorrenza.

## Fondamenta visive

**Colore.** La tavolozza viene dai materiali dell'isola: `calce` (i muri imbiancati) come sfondo, `lava` (la pietra lavica) per il testo e per la voce locale, `coccio` (la terracotta) come colore del brand. Tre colori di dominio aiutano a orientarsi senza leggere:

| Token | Dominio | Esempi |
| --- | --- | --- |
| `mare` / `mare-tint` | Viaggio: mare, natura, spostamenti, voli, noleggio | Chip "Mare", trasferimento, chip "Confronta noleggi" |
| `pistacchio` / `pistacchio-tint` | Gusto: cibo, vino, shop, produttori | Chip "Cibo e vino", card prodotto |
| `zagara` / `zagara-tint` | Ricompense: punti, timbri, classifica | Pillola punti, timbro |

Regole:

- **`coccio` è solo un riempimento:** bottone principale (uno per vista, anche contando l'intestazione), punto della tappa in corso, marchio. Link, etichette e testo di marca usano `coccio-text`.
- **`ink` come superficie** si usa solo per la voce locale (`LocalTip`, la fascia editoriale della home) e per il footer. Non si usa `lava` come superficie: nel tema scuro diventa chiaro.
- **`zagara` non è mai testo**, con una sola eccezione: `ink-label` su `ink`.
- **Una sola fascia colorata per pagina** oltre a quella `lava`: niente patchwork di fasce pastello.
- `zagara` pieno solo nel momento in cui si guadagna qualcosa; a riposo la pillola punti è `zagara-tint`.
- Il 70% di ogni schermata è `calce`, `calce-raised` e `lava`.

**Tipografia.** **Fraunces** (serif variabile) per titoli, nomi di luoghi, prezzi e numeri, da 17px in su, mai per testo corrente. **Instrument Sans** per tutto il resto, mai sotto 16px per il testo su mobile. Fraunces usa `font-optical-sizing: auto` (l'asse ottico segue la dimensione) e l'asse `SOFT` a 50 nei titoli display, che arrotonda le terminazioni e la distingue dall'uso comune del carattere. In produzione i font si caricano con `next/font/google` (Fraunces con assi `opsz` e `SOFT`, Instrument Sans), non con `@import`.

**Spazio e griglia.** Griglia da 12 colonne, larghezza massima 1200px, gutter `space-6`. Su mobile margini `space-4` e una colonna. `space-16` tra sezioni su desktop, `space-12` su mobile.

**Forme.** Card a `radius-lg`, immagini hero a `radius-xl`, bottoni e chip a `radius-pill`. Ombre basse e calde (`shadow-card`) solo su elementi toccabili; nel tema scuro le card hanno anche il bordo `card-edge`. Niente gradienti.

## Elementi firma

**La voce locale.** Il `LocalTip`: superficie `ink` (scura in entrambi i temi), testo `on-ink`, etichetta `ink-label`, il consiglio in `body-l`, sotto la firma: redazione o persona reale, relazione con il luogo, data di verifica. Compare nella scheda attività subito dopo "Perché è per te", nell'itinerario accanto alla tappa, nella home come fascia editoriale.

**La linea del percorso.** Una linea tratteggiata in `lava-muted` (2px, tratti 2 e spazi 6) collega le tappe di un itinerario. È una sola linea per giorno, non un pezzo per tappa, così si può animare. Compare nell'itinerario, nelle mappe, nei video.

**Il timbro.** I badge sono timbri rotondi da 120px: cerchio `zagara`, anello tratteggiato `on-zagara`, nome in maiuscolo di al massimo 16 caratteri per riga. Da bloccati mostrano il progresso ("4 di 9 province"). Trasformano la gamification in collezione.

**Il perché.** La riga "Per te" (viaggio singolo) o "Per il gruppo" (viaggio di gruppo) su ogni suggerimento, con al massimo due motivi. I motivi spiegano, non ripetono l'input né i voti: "Ami la storia · 20 min dalla base", non "Storia 4 su 5". Nel gruppo il motivo è aggregato e informativo ("Natura tra i primi interessi di 3 su 4 · 25 min dalla base"); sotto i 3 membri si mostra solo il motivo logistico, perché con 2 persone l'aggregato rivelerebbe le risposte dell'altro.

## Fotografia

Foto reali, luce naturale calda, persone che fanno cose, non cartoline vuote o droni patinati. Formati: 4:5 per le card, 16:9 o piena larghezza per gli hero, 1:1 per i prodotti. Mai testo sopra la foto. Didascalia con luogo e autore in `caption`. Fino alle foto vere, segnaposto `calce-sunk` con il nome del luogo, mai foto di stock.

## Icone

Set Lucide, tratto 1.5px, 20px nell'interfaccia e 24px nella navigazione, colore `lava-muted` o il colore di dominio. Un'icona accompagna sempre un testo, tranne chiudi, cerca e menu, che hanno comunque un'etichetta accessibile. Niente emoji nell'interfaccia.

## Accessibilità

Coppie verificate da un test sui valori di `tokens.json`: testo `lava-muted` su `calce`, `calce-sunk` e le tinte almeno 5,7:1 in entrambi i temi (5,79:1 su `coccio-tint` nel tema chiaro, le altre almeno 5,9:1); `coccio-text` su `calce`, `calce-sunk` e tutte le tinte almeno 5,8:1 nel tema chiaro, e nel tema scuro almeno 6:1 su `calce` e `calce-sunk` e almeno 4,5:1 sulle tinte; bianco su `coccio` 5,45:1; `coccio` come superficie di bottone su `calce` scuro 3,36:1. Non usare `coccio` per testo su nessuna tinta. Voce locale: `on-ink` su `ink` 15,3:1 (chiaro) e 13,1:1 (scuro), `ink-label` su `ink` almeno 8,3:1. Focus visibile su ogni elemento interattivo, card e link compresi, con l'anello `focus`. Aree toccabili di almeno 44px, anche quando il disegno è più piccolo (area estesa con `::after`). I colori non sono mai l'unico segnale: voti e stati hanno sempre un'icona o una parola. Il movimento rispetta `prefers-reduced-motion`.
