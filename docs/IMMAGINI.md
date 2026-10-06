# Immagini del catalogo

Regole editoriali e tecniche per le foto e le illustrazioni di luoghi, attività, itinerari e aree. Valgono per chi carica immagini dall'admin e per chi modifica il codice in `src/server/media/`, `src/lib/media.ts` e nelle migrazioni dei media.

## Cosa si pubblica

- **Foto vere del luogo vero.** Ogni foto ritrae il luogo, l'attività o l'itinerario a cui è collegata: niente foto di un altro posto "che gli somiglia".
- **Mai stock generico e mai immagini generate** (da modelli di intelligenza artificiale o simili). Fino alla foto vera, la pagina usa la catena di ripiego (sotto), non un'immagine di riempimento.
- **Nessuna persona riconoscibile senza il suo consenso scritto.** Vale anche per le foto con licenza libera: la licenza copre il diritto d'autore, non il diritto all'immagine della persona ritratta. L'importatore Commons segnala le foto con l'avviso "personality".
- **Testo alternativo italiano obbligatorio** (inglese consigliato): cosa si vede, in una frase.

## Licenze

| Fonte | Ammessa | Note |
| --- | --- | --- |
| Foto proprie (`own`) | Sì | Autore e licenza obbligatori (anche "Tutti i diritti riservati"). |
| CC0, pubblico dominio | Sì | Importabili da Commons. |
| CC BY (qualsiasi versione) | Sì | Importabili da Commons. Autore, licenza con link e "modificata" nella didascalia. |
| CC BY-SA | Solo su scelta esplicita dell'admin | Mai dall'importatore a righe. In Foto da Commons solo spuntando "Ammetti anche foto con licenza CC BY-SA": è la valutazione di Ludovico, per quella ricerca. Didascalia con autore e licenza; le versioni ritagliate restano CC BY-SA. |
| NC (non commerciale), ND (non opere derivate) | No | Il sito è commerciale e le varianti sono ritagli, cioè opere derivate. |
| Agenzie fotografiche | Solo con licenza commerciale | Mai "solo uso editoriale". Il contratto va conservato fuori dal sito; nel campo licenza il suo nome. |
| Partner (`partner`) | Sì, con autorizzazione scritta del partner | Autore e licenza obbligatori. |
| Illustrazioni (`illustration`) | Solo quelle della redazione | SVG statici forniti da Ludovico; didascalia "Illustrazione di Isula". |

Ogni luogo, attività, itinerario e area deve mostrare una foto vera coerente con il nome. Le aree possono avere una foto (o, in alternativa, un'illustrazione della redazione).

Le foto con licenza sono sempre "modificate": le varianti sono ritagli e riduzioni dell'originale, e le licenze CC chiedono di dichiararlo.

## Beni culturali

Le immagini di beni culturali in consegna a un ente pubblico (parchi archeologici, musei, monumenti statali o regionali) seguono gli articoli 107 e 108 del Codice dei beni culturali e del paesaggio (d.lgs. 42/2004): la riproduzione per fini commerciali richiede l'autorizzazione dell'ente che ha in consegna il bene e, di norma, il pagamento di un canone. Il sito è commerciale (link affiliati e shop), quindi vale anche per le foto con licenza libera: la licenza del fotografo non sostituisce l'autorizzazione dell'ente.

Nell'admin: spuntare "Ritrae un bene culturale in consegna a un ente pubblico" e collegare un'autorizzazione (Immagini → Autorizzazioni per i beni culturali: ente, protocollo, data di rilascio, scadenza, ambito, link al documento). Una stessa autorizzazione vale per più immagini. Senza autorizzazione, o a scadenza passata, l'immagine è bloccata e la pagina passa al ripiego; la Copertura del catalogo elenca le autorizzazioni in scadenza entro 60 giorni.

Il testo definitivo di questa sezione, e di quello che il sito dichiara agli utenti, lo conferma chi scrive i testi legali.

## Catena di ripiego

Nessuna pagina mostra un riquadro vuoto:

- **attività** → copertina propria → copertina del luogo → illustrazione dell'area;
- **itinerario** → copertina propria → copertina del luogo della prima tappa → illustrazione dell'area di quel luogo;
- **luogo** → copertina propria → illustrazione dell'area.

Un anello vale solo se il media è *usabile* (`public.media_is_usable`): testo alternativo italiano, autore e licenza (foto), varianti generate (foto), autorizzazione valida (beni culturali). Un media non usabile è *bloccato* e si passa all'anello successivo. Se manca tutto, la pagina mostra il segnaposto `calce-sunk` con il nome del luogo; in produzione non succede, perché i controlli di lancio esigono un'illustrazione usabile per ogni area e un'area per ogni luogo. Logica in `src/lib/media.ts` (test in `media.test.ts`), letture in `src/server/catalog/queries.ts` (test in `covers.int.test.ts`).

## Didascalie e crediti

- Sotto le immagini di pagina: "Foto: autore, licenza" con i link, più "modificata"; per le illustrazioni "Illustrazione di Isula" (`CoverFigure`).
- `/crediti-foto` elenca tutti i media pubblici con autore, licenza e fonte (la pagina del file su Wikimedia Commons), è nella sitemap e nel footer.
- `source_url` è interno: il pubblico vede solo `source_link`, cioè `source_url` quando è una pagina di commons.wikimedia.org.

## Come entrano le immagini

### Caricamento dall'admin

Immagini → Carica immagini. JPEG, PNG o WebP fino a 10 MB con il lato lungo di almeno 1600 px (le illustrazioni in SVG). Il nome del file abbina l'immagine: `slug-01.jpg`, `slug-02.jpg`… per luoghi, attività e itinerari pronti; `slug-01.svg` per le aree. La prima immagine di un'entità senza copertina lo diventa; le altre si assegnano dalla scheda dell'immagine ("Usa come copertina di").

Percorso del file: il browser carica su un URL firmato in `incoming/` (fuori dalla funzione serverless, che su Vercel accetta al massimo 4,5 MB); il server controlla il contenuto vero con sharp (tipo, dimensioni, SVG senza script né riferimenti esterni), salva l'originale ripulito (orientamento applicato, EXIF, GPS, XMP e IPTC rimossi), genera le varianti e cancella il file grezzo. Poi si compilano testo alternativo, tipo, autore e licenza nella tabella "Da completare".

### Foto da Commons (entità senza foto vera)

Immagini → Foto da Commons elenca luoghi, attività, itinerari pronti e aree senza una foto vera: nessuna immagine, immagine bloccata, solo illustrazione o segnaposto demo.

**Metodo principale: la foto principale di Wikipedia/Wikidata** (`src/server/media/wiki-images.ts`). Per ogni voce:

1. su it.wikipedia si sceglie la voce, in quest'ordine: la voce con il titolo uguale al nome (niente pagine di disambiguazione), poi le voci entro 10 km dalle coordinate dell'entità, poi la ricerca per nome. Una voce vale solo se il titolo è coerente con il nome (ogni parola del titolo è nel nome, oppure almeno due parole significative in comune) e, se ha coordinate, sta entro 25 km dall'entità. Esempi: Catania → Catania, non Myriam Catania; Visita al Teatro Massimo → Teatro Massimo Vittorio Emanuele, non Teatro alla Scala; Corso di cous cous trapanese → nessuna voce;
2. si prende l'immagine dell'elemento Wikidata (P18) o, in mancanza, quella della voce: l'hanno scelta i redattori di Wikipedia per quel soggetto, ed è sempre un file di Commons. Le voci su persone (Wikidata: istanza di essere umano) si saltano, perché la loro immagine è un ritratto: si passa alla voce successiva;
3. il file passa dagli stessi controlli dell'importatore (licenza, lato lungo, download da upload.wikimedia.org: se la miniatura proposta dall'API non è lì, si costruisce dall'URL dell'originale), con autore obbligatorio e senza persone riconoscibili. La licenza si legge da extmetadata e, se il file ne ha più d'una (es. GFDL e CC BY-SA), dalle sue categorie di licenza; l'autore da "Artist" o, in mancanza, da "Credit" (non "Opera propria"). Quando un file viene scartato, la riga dice perché (licenza, autore mancante, persone).

Le attività e gli itinerari senza una voce propria restano senza foto propria e mostrano quella del luogo (catena di ripiego); un'area senza voce adatta riusa la foto di uno dei suoi luoghi. "Trova e assegna le foto mancanti" lavora a passi brevi; "Cerca su Commons" mostra per prima la foto di Wikipedia e poi le alternative della ricerca su Commons (per posizione e per nome).

**Licenze.** Le immagini principali di Wikipedia sono spesso CC BY-SA: servono la casella "Ammetti anche foto con licenza CC BY-SA" (scelta di Ludovico). NC e ND sono sempre escluse.

**Richieste.** Una al secondo, in fila, verso it.wikipedia.org, www.wikidata.org, commons.wikimedia.org e upload.wikimedia.org soltanto (`src/server/media/wikimedia.ts`, sopra safeFetch), con User-Agent che porta il contatto `WIKIMEDIA_CONTACT` (un'email: senza, Wikimedia limita le richieste e risponde 429; la pagina lo segnala). Con 429 o 503 si aspetta e si riprova fino a tre volte; gli errori mostrano il codice HTTP.

Il testo alternativo viene dalla descrizione su Commons (o dal nome): va riletto dalla tabella delle immagini. Le foto di parchi archeologici, musei e monumenti pubblici vanno segnate come beni culturali, con l'autorizzazione, prima del lancio.

Nel sito locale le immagini demo (`npm run media:demo`) sono segnaposto: con l'app avviata, un account admin e `WIKIMEDIA_CONTACT` nel `.env.local`, "Trova e assegna le foto mancanti" le sostituisce con foto vere.

### Importatore Wikimedia Commons

Immagini → Importa da Wikimedia Commons. Una riga per immagine: `slug;URL della pagina del file su commons.wikimedia.org`. Il server legge autore, licenza e descrizione dall'API MediaWiki (`extmetadata`), accetta solo CC0, CC BY e pubblico dominio e rifiuta il resto con il motivo. L'autore si ripulisce dall'HTML (solo testo e un link http/https). Anteprima da confermare; alla conferma il server rilegge i metadati (non si fida dell'anteprima del browser), scarica una copia larga 1920 px (larghezza standard delle miniature di Wikimedia) e la salva con `accessed_at` = oggi e `modified` = vero.

Il download (`src/server/media/safe-fetch.ts`) accetta solo https, porta 443, host esatti in allowlist (`commons.wikimedia.org` per l'API, `upload.wikimedia.org` per i file), segue al massimo 3 redirect controllando ogni destinazione, ha un timeout, verifica tipo e dimensione (anche in streaming) e rifiuta qualsiasi indirizzo interno al momento della connessione (anche con un DNS che cambia risposta).

## Varianti e rendering

- Ritagli 4:5 (card), 16:9 (pagine), 1:1 sul punto focale, scelto con un clic sull'originale nella scheda dell'immagine. Larghezze 480, 800, 1200, 1600 px, in AVIF e WebP, più un segnaposto sfocato di 16 px.
- Un nuovo punto focale crea una nuova versione delle varianti (`v2/`, `v3/`…) e cancella la precedente: gli URL cambiano, nessuna cache vecchia.
- `CoverPicture` usa `getImageProps` di `next/image` con un loader che sceglie la variante: `<picture>` con AVIF e WebP, `srcset` e `sizes`. L'immagine principale della pagina ha `fetchPriority="high"`.

## Storage e sicurezza

- Bucket privato `media` (migrazione `media_rls_storage`): JPEG, PNG, WebP, AVIF, SVG, al massimo 10 MB.
- Il pubblico legge solo le varianti correnti (e gli SVG) dei media pubblici: usabili e copertina di un'entità pubblicata (luoghi, aree, attività attive, itinerari pronti). Mai l'originale né `incoming/`. Lettura e scrittura complete solo per l'admin (`public.is_admin()`). Test in `supabase/tests/media_rls.test.sql`.
- I file passano dalla route `/api/media/…`, che li chiede allo storage con il ruolo del visitatore: anon prima (cache pubblica di un'ora sulla CDN, quindi un media tolto dalla pubblicazione smette di essere servito entro un'ora), poi la sessione per l'anteprima dell'admin (senza cache).
- Le azioni dell'admin fanno Zod → `requireAdmin` → scrittura; lo storage usa la sessione dell'admin, quindi le policy restano la seconda difesa (nessuna chiave di servizio nell'app).
- `image_authorizations` è chiusa all'API: la legge solo il server.

## Dati demo

`npm run media:demo` (dopo `npm run db:reset`, e in CI, dove non si dipende dalla rete verso Wikimedia) genera immagini di prova a tinta unita con il nome, con nome file `demo-…` e testo alternativo `[DEMO]`: mai foto vere né immagini generate da modelli. Il controllo di lancio sui dati demo le blocca in produzione, e lo script rifiuta di girare fuori da Supabase locale.

## Controlli di lancio (PRE_LAUNCH)

`e2e/launch.spec.ts` con `LAUNCH_DATABASE_URL` (vedi `docs/LANCIO.md`):

- nessun luogo in evidenza senza una foto vera propria e usabile;
- nessun itinerario pubblicato senza foto vera (propria o del luogo della prima tappa);
- nessun media pubblico senza testo alternativo italiano;
- nessuna foto con licenza senza autore e licenza;
- nessun bene culturale senza autorizzazione valida;
- ogni luogo con una foto vera usabile (le attività senza foto propria mostrano quella del luogo);
- ogni area con una copertina usabile (foto o illustrazione), ogni luogo con un'area;
- nessuna immagine demo.

Un luogo in evidenza la cui foto è bloccata esce comunque dal carosello senza fermare gli altri (`listFeaturedPlaces`).
