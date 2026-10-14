# Catalogo delle attività: preparazione e importazione

Regole per chi prepara le attività fuori dal codice (foglio di calcolo) e le carica da **Admin → Attività → Importa CSV**. Valgono insieme a [IMMAGINI.md](IMMAGINI.md) e al manuale del brand (`docs/design/brand/manuale.md`, "Voce e contenuti").

## Regole editoriali

- **Descrizioni con parole proprie.** Mai copiate o parafrasate da altri siti, guide o pagine dei partner: si scrivono da zero, dopo aver verificato i fatti. Niente parole vietate del manuale ("magico", "incantevole", "perla", "da non perdere"…), niente punti esclamativi multipli, niente emoji.
- **Prezzi in loco, non dei partner.** `on_site_price_eur` è quanto si paga sul posto (ingresso, biglietto). Il prezzo di un tour venduto da un partner è un'offerta (`activity_offers`) e non va mai in questa colonna. Se si entra gratis, `0`; se non si sa, vuoto.
- **Stagione in mesi.** `season_months` elenca i mesi in cui l'attività si fa (1 = gennaio … 12 = dicembre), es. `4;5;6;7;8;9;10`. Vuoto = tutto l'anno.
- **Interessi dalla tabella `interests`.** Solo le chiavi elencate sotto, con una forza da 1 a 3.
- **Diete come indicazione, non come garanzia**: vanno confermate con chi organizza.
- **Fonti e note restano interne.** `source_url` e `notes` servono alla redazione: stanno nella tabella `activity_sources`, leggibile solo dagli admin, e non compaiono mai in pagine o viste pubbliche.

## Il file

Il modello (solo intestazione) si scarica dalla pagina di importazione. CSV in UTF-8, una riga per attività, al massimo 1000 righe e 1 MB. Il separatore può essere la virgola o il punto e virgola (quello che usa Excel in italiano): si riconosce dall'intestazione. Con il punto e virgola come separatore, i campi che contengono un elenco vanno tra virgolette, oppure gli elementi si separano con `|`.

| Colonna | Obbligatoria | Contenuto |
| --- | --- | --- |
| `slug` | sì | Indirizzo dell'attività: minuscole, numeri e trattini. È la chiave: un file ricaricato aggiorna le stesse attività. |
| `name_it` | sì | Titolo italiano (max 200 caratteri). |
| `name_en` | no | Titolo inglese. |
| `area_slug` | per luogo nuovo | Slug dell'area (tabella `areas`). |
| `place_slug` | sì | Slug del luogo. Se esiste, si usa quel luogo e le altre colonne del luogo si ignorano (l'anteprima lo segnala). |
| `place_name` | per luogo nuovo | Nome del luogo. |
| `place_province` | per luogo nuovo | Sigla della provincia (PA, CT, TP…). |
| `place_lat`, `place_lng` | per luogo nuovo | Coordinate decimali (punto o virgola). |
| `place_tagline_it` | no | Una riga sul luogo, max 90 caratteri. |
| `description_it` | no | Descrizione con parole proprie. |
| `duration_min` | sì | Durata in minuti (1–1440). |
| `on_site_price_eur` | no | Prezzo in loco in euro. |
| `requires_car`, `accessible` | no | `sì`/`no` (anche `true`/`false`, `1`/`0`); vuoto = no. |
| `season_months` | no | Mesi, es. `5;6;7;8`. |
| `diets_suitable` | no | `vegetarian`, `vegan`, `gluten_free`, `lactose_free`. |
| `interests` | no | `chiave:forza`, es. `mare:3;storia:2`. |
| `image_file` | no | Nome di un file già caricato in Immagini (cercato su `original_filename`): se ce n'è uno solo diventa la copertina dell'attività. |
| `source_url` | no | Fonte consultata (http/https). Interna. |
| `notes` | no | Note per la redazione (max 2000 caratteri). Interne. |

### Interessi

| Chiave | Si scrive anche | Etichetta |
| --- | --- | --- |
| `sea` | `mare` | Mare |
| `food_wine` | `cibo` | Cibo e vino |
| `history_archaeology` | `storia` | Storia e archeologia |
| `nature_hiking` | `natura` | Natura ed escursioni |
| `villages` | `borghi` | Borghi |
| `art` | `arte` | Arte |
| `nightlife` | `vita notturna` | Vita notturna |
| `local_experiences` | `esperienze locali` | Esperienze locali |
| `relax` | `relax` | Relax |

Vale la chiave, l'etichetta intera o la sua prima parola, senza distinzione di maiuscole. Forza: 1 = c'entra, 2 = conta, 3 = è il motivo dell'attività. Se la colonna è vuota, un'attività esistente tiene i tag che ha.

## Cosa succede all'importazione

1. **Anteprima.** Nulla si salva: l'anteprima mostra le righe da creare, quelle che aggiornano un'attività esistente (con l'avviso se è già attiva, perché le modifiche vanno subito online) e quelle con errore, con il motivo.
2. **Conferma.** Il server rilegge e ricontrolla il file (non si fida dell'anteprima) e salva tutto in una transazione:
   - attività nuove: **inattive** e **da verificare**;
   - attività esistenti: aggiornate sullo `slug`, tornano da verificare, lo stato attiva/inattiva non cambia. Il file è la fonte di ogni campo dell'attività: una cella vuota svuota il campo (es. `name_en`, `description_it`, prezzo). Fanno eccezione gli interessi (vuoti = restano i tag), `image_file` (senza un file trovato resta la copertina) e `source_url`/`notes` (vuoti = restano quelli salvati);
   - luogo mancante: creato con area, provincia e coordinate del file, **non pubblicato** e da verificare;
   - righe con errore: scartate.
3. **Registro.** Ogni importazione aggiunge una riga in `admin_audit_log` (`catalog.import`) con gli slug creati, aggiornati e scartati e i luoghi creati.

L'attivazione resta soggetta alle regole del catalogo: un'attività attiva ha almeno un tag, e il suo luogo è pubblicato.

## Da verificare

**Admin → Attività → Da verificare** elenca le attività con `needs_review`. Filtri per area e per dato mancante: tag, coordinate (luogo creato dall'import con coordinate non ancora verificate), area del luogo, foto propria. "Verificata" toglie l'attività dalla coda (e lo annota nel registro); "Modifica" apre la scheda, dove si completano i dati e si attiva. I luoghi creati dall'import si pubblicano dalla loro scheda (Luoghi).
