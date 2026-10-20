# Lancio: configurazione di produzione

Passi da fare una volta sul progetto Supabase di produzione e su Vercel prima di aprire il sito, più il modo di verificarli. Il controllo automatico è l'e2e `e2e/launch.spec.ts`, che parte con `PRE_LAUNCH=1` (vedi "Verifica automatica" in fondo).

## 0. Dati del titolare e testi legali

Le pagine legali (privacy, cookie, termini, condizioni di vendita, regolamento punti, chi siamo) e il contatto leggono i dati del titolare dall'ambiente di Vercel. Sono pubblici (`NEXT_PUBLIC_`), quindi non vanno messi in nessun segreto. Da compilare prima del lancio.

| Variabile | Valore | Verifica |
| --- | --- | --- |
| `NEXT_PUBLIC_LEGAL_NAME` | ragione sociale del titolare | A mano: in `/it/privacy` il nome compare al posto del trattino "—" |
| `NEXT_PUBLIC_LEGAL_ADDRESS` | sede legale | A mano: in `/it/privacy` la sede compare al posto del trattino |
| `NEXT_PUBLIC_LEGAL_VAT_NUMBER` | partita IVA, 11 cifre | Un valore con altre cifre blocca il caricamento del sito: il messaggio d'errore lo dice |
| `NEXT_PUBLIC_PRIVACY_EMAIL` | indirizzo per l'esercizio dei diritti privacy | A mano: l'indirizzo compare in `/it/privacy` |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | assistenza: mostrata nel sito (`/it/contatti`, dichiarazione di accessibilità) e destinataria dei messaggi del modulo di contatto | A mano: `/it/contatti` mostra l'indirizzo; dopo un invio di prova arriva l'email con "Rispondi a" sul mittente |

Finché anche una sola delle cinque variabili manca, le pagine legali restano in preparazione: mostrano l'avviso "Pagina in preparazione: mancano ancora i dati del titolare.", non sono indicizzate e non stanno nella sitemap. Il controllo `isLegalReady()` (`src/lib/legal-entity.ts`) è la stessa verifica.

I testi stanno in `content/legal/*.md`, senza variabili scritte a mano: `{{titolare}}`, `{{sede}}`, `{{partita_iva}}`, `{{email_privacy}}`, `{{email_assistenza}}`, `{{spedizione_testo}}` (la tariffa viene da `src/lib/shop/config.ts`). Dopo ogni modifica di un testo: aumentare `version` e aggiornare `updated` nell'intestazione, poi `npm run content:legal` e commit di `generated/content/legal.ts`. In CI `npm run design:check` verifica che il file generato sia aggiornato. Le versioni in inglese vanno in `content/legal/<id>.en.md`; senza, la pagina inglese mostra il testo italiano con l'avviso "Disponibile in italiano".

## 1. Configurazione di Supabase Auth con `supabase config push`

`supabase config push` invia al progetto collegato le proprietà dichiarate in `supabase/config.toml`. L'ho verificato nel sorgente della CLI (`apps/cli-go/pkg/config/auth.go` e `config.go`). Le proprietà inviate sono:
- `site_url`;
- gli accessi anonimi (`enable_anonymous_sign_ins`);
- il CAPTCHA, cioè attivazione, provider e segreto;
- "Confirm email" (`enable_confirmations`, inviato come `mailer_autoconfirm = !enable_confirmations`);
- i template email, con oggetto e contenuto letti da `content_path`.

Quindi sostituisce la configurazione a mano nella dashboard.

**Attenzione:** `config.toml` contiene valori locali che in produzione romperebbero il sito:
- `site_url = localhost`;
- la chiave segreta di prova di Turnstile;
- `email_sent = 2` all'ora.

La CLI fonde un blocco `[remotes.<nome>]` sopra la configurazione base solo quando il suo `project_id` coincide con il progetto collegato. Per la produzione serve quindi il blocco `[remotes.production]`, oggi commentato in fondo a `config.toml`:

1. Togli il commento al blocco e scrivi il `project_id` del progetto di produzione (20 lettere minuscole, dalla URL della dashboard). Finché il blocco è commentato `supabase start` funziona: con un id non valido la CLI rifiuta il file.
2. Esporta i segreti nell'ambiente, mai nel file: `SUPABASE_AUTH_CAPTCHA_SECRET` (chiave segreta di Turnstile) e, se usi Google, `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` e `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`.
3. `npx supabase link --project-ref <ref>`, poi `npx supabase config diff --project-ref <ref>`. Leggi il diff: devono cambiare solo le voci che ti aspetti.
4. `npx supabase config push --project-ref <ref>`. La CLI chiede conferma per ogni risorsa.

Restano manuali solo i segreti (passo 2 e sezione 2) e l'SMTP di produzione, se lo vuoi configurare da file.

**Cosa deve risultare, e come verificarlo**

| Voce | Valore | Verifica |
| --- | --- | --- |
| Confirm email | attivo | `GET <url>/auth/v1/settings`: `mailer_autoconfirm` è `false`. Senza, `updateUser` di un ospite salva l'email senza il codice. |
| Accessi anonimi | attivi | `/auth/v1/settings`: `external.anonymous_users` è `true` |
| Accesso via email | attivo | `/auth/v1/settings`: `external.email` è `true`, `disable_signup` è `false` |
| CAPTCHA Turnstile | attivo, con la chiave segreta vera | `POST <url>/auth/v1/signup` con body `{}` risponde 400 `captcha_failed`. A mano: "Continua senza account" sul sito funziona. |
| Template email | `supabase/templates/code.html` (Magic Link e Confirm signup) e `email-change.html` (Change Email Address). Si rigenerano con `npm run email:templates` (testi in `messages/*.json`, namespace `Email.supabase`; colori dai token): dopo ogni modifica si rigenerano e si copiano nella dashboard (Authentication → Email Templates), o si inviano con `config push` (sopra). In CI, `scripts/email/build-supabase-templates.test.ts` verifica che i file siano aggiornati. | A mano: chiedi un codice dalla pagina di accesso; l'oggetto è "Il tuo codice Isula: 123456"; il pulsante porta al dominio di produzione |
| Site URL e redirect | dominio di produzione e `https://<dominio>/api/auth/callback` | A mano: il link nell'email porta al dominio di produzione |

## 2. Vercel

| Variabile | Valore | Verifica |
| --- | --- | --- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | site key del widget Turnstile del dominio | Se manca, la build di produzione si ferma (`src/lib/env.ts`). A mano: il widget non mostra l'avviso "testing only". |
| `TURNSTILE_SECRET_KEY` | chiave segreta di Turnstile, la stessa di `SUPABASE_AUTH_CAPTCHA_SECRET` (solo lato server) | Senza, il modulo di contatto risponde sempre "verifica non riuscita": in produzione la verifica fallisce chiusa. A mano: un messaggio di prova da `/it/contatti` arriva all'assistenza. |
| `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_LEGAL_ADDRESS`, `NEXT_PUBLIC_LEGAL_VAT_NUMBER`, `NEXT_PUBLIC_PRIVACY_EMAIL`, `NEXT_PUBLIC_SUPPORT_EMAIL` | dati del titolare, vedi la sezione 0 | Senza, le pagine legali restano in preparazione e il contatto non ha un destinatario. |
| `WIKIMEDIA_CONTACT` | email di contatto per Wikimedia (es. l'email della redazione) | Serve a Foto da Commons: senza, Wikimedia limita le richieste (429). La pagina admin avvisa se manca. |
| `CRON_SECRET` | stringa casuale lunga (es. `openssl rand -hex 32`) | `GET https://<dominio>/api/cron/cleanup-guests` senza header risponde 401. Nei log di Vercel il cron delle 3:00 UTC risponde 200 con `{"deleted": n}`. |
| Classifica stagionale: refresh | job `refresh-leaderboard` di pg_cron ogni 15 minuti, creato dalla migrazione `20261015184024_classifiche.sql` (indipendente dal piano Vercel). `GET /api/cron/refresh-leaderboard` con `CRON_SECRET` serve per un refresh manuale | Nel SQL editor di Supabase: `select jobname, schedule from cron.job` mostra `refresh-leaderboard` con `*/15 * * * *`; `select * from cron.job_run_details order by start_time desc limit 3` mostra esecuzioni riuscite. |
| `RATE_LIMIT_SECRET` o `AFFILIATE_LINK_SECRET` | stringa casuale lunga (es. `openssl rand -hex 32`); basta una delle due | Senza entrambe il limite sui click (`/api/go`) è spento. A mano: dopo 60 click in un minuto dallo stesso IP la pagina mostra l'avviso "Troppi click in poco tempo". |
| `RESEND_API_KEY` e `EMAIL_FROM` | chiave API di Resend (dominio verificato) e mittente, es. `Isula <inviti@dominio>` | Senza, gli inviti via email non partono: la pagina del gruppo mostra "email non disponibile". A mano: da un gruppo si invia un invito a un indirizzo di prova e arriva l'email con il pulsante "Apri l'invito". Serve anche la chiave del rate limit (riga sopra). |

Il widget Turnstile si crea su Cloudflare (Turnstile → Add widget) con il dominio di produzione. Da lì vengono la site key (Vercel) e la chiave segreta (`SUPABASE_AUTH_CAPTCHA_SECRET` per `config push`).

## 3. Immagini del catalogo

Il bucket `media` e le sue policy arrivano con le migrazioni (`supabase db push`), non con `config push`: non serve crearlo dalla dashboard. Prima del lancio, dall'admin:

- ogni luogo, i luoghi in evidenza e gli itinerari pronti hanno una foto vera completa (testo alternativo, autore, licenza): Immagini → Foto da Commons assegna quelle mancanti, da rileggere;
- ogni area ha una copertina (foto o illustrazione SVG) e ogni luogo ha un'area;
- le immagini di beni culturali hanno un'autorizzazione non scaduta.

Regole complete in [IMMAGINI.md](IMMAGINI.md).

## 4. Partner affiliati

| Voce | Valore | Verifica |
| --- | --- | --- |
| RATE_LIMIT_SECRET o AFFILIATE_LINK_SECRET | impostate in produzione (senza, il limite sui click è spento) | Vedi la tabella della sezione 2. |
| Template e parametri dei partner | in Admin → Partner confermati con i termini di ogni programma (template, host, parametro del subid, variabile dell'ID) | A mano: per ogni partner attivo, il template e il parametro del subid corrispondono ai termini del programma. Il click di prova porta al partner con il subid. |
| `VIATOR_API_KEY`, `GETYOURGUIDE_API_KEY` | chiavi Partner API (facoltative: senza, l'import di quel partner non gira) | Prima di impostarle, confrontare endpoint, header e campi di `src/server/partners-import/adapters/*.ts` con la documentazione del partner (scritti senza accesso alle API). Dopo il cron delle 2:30 UTC, Admin → Import partner mostra una riga "ok" per partner. |
| `ANTHROPIC_API_KEY` | chiave API Anthropic (facoltativa) | Senza, le attività nuove dell'import arrivano senza tag proposti. Con la chiave, la coda "Da verificare" mostra i tag proposti. |
| `EMBEDDINGS_PROVIDER`, `VOYAGE_API_KEY` | `voyage` (default) e la chiave Voyage AI (facoltativa) | Senza chiave il cron delle 4:00 UTC (`embed-activities`) non fa nulla. Con la chiave risponde 200 con il numero di attività calcolate. |

## 5. Conversioni dei partner (report)

Le conversioni entrano in due modi: dal CSV caricato dall'admin (Affiliati → Importa, con anteprima) e dal cron `/api/cron/import-conversions` (05:00 UTC), che oggi non esegue alcun adattatore. Nessun partner è collegato via API: i report API vanno verificati con le condizioni di ogni programma prima di attivarli (accesso al report, frequenza consentita, dati personali nel report). Finché non ci sono adattatori attivi, il cron risponde 200 con zero righe e i dati si caricano dal CSV.

| Voce | Valore | Verifica |
| --- | --- | --- |
| Report API di un partner | da attivare solo dopo la verifica delle condizioni del programma | A mano: la risposta del cron elenca il partner con `status: "ok"` solo dopo l'attivazione; prima risulta `skipped`. |
| Import CSV | dal modello scaricabile in Affiliati → Importa; anteprima prima della conferma | A mano: un file di prova con un subid di un click reale porta la conversione in dashboard; il file ripetuto aggiorna le stesse righe. |

## 6. Tempo reale dei viaggi di gruppo

I viaggi di gruppo si aggiornano con un canale broadcast privato `itinerary:<id>`: lo alimentano i trigger del database (`itinerary_realtime_notify`), e lo autorizza la policy `itinerary_topic_members_receive` su `realtime.messages`, che arriva con le migrazioni. Nessuna tabella del viaggio è nella publication `supabase_realtime`.

| Voce | Valore | Verifica |
| --- | --- | --- |
| Realtime, canali privati | Dashboard → Realtime → Settings: lasciare i canali privati consentiti (impostazione predefinita) | A mano, con due account nello stesso gruppo: il voto di uno compare all'altro entro 2 secondi senza ricaricare. Un terzo account, fuori dal gruppo, non riceve nulla (DevTools → WS: la sottoscrizione a `itinerary:<id>` è rifiutata). |

## 6b. Mappe (OpenFreeMap)

Le mappe (itinerari, viaggi, luoghi, lista delle attività) usano lo stile base di OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`): nessuna chiave, nessun cookie. Il servizio non dà garanzie di disponibilità né un accordo commerciale: prima del lancio controllarne i termini d'uso e il traffico previsto. Se non bastano, l'alternativa è MapTiler (con chiave e quota), cambiando `MAP_STYLE_URL` in `src/components/design/map/map-style.ts`; i colori restano quelli dei token.

| Voce | Valore | Verifica |
| --- | --- | --- |
| Tile | Richieste a `tiles.openfreemap.org` solo quando la mappa entra nello schermo | A mano: itinerario pronto con la mappa, DevTools → Rete: la prima richiesta ai tile parte dopo lo scroll, e lo stato è 200. |
| Attribuzione | "© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors" leggibile in ogni mappa | A mano su 390 e 1280, nei due temi. |

## Verifica automatica

```bash
PRE_LAUNCH=1 \
LAUNCH_SUPABASE_URL=https://<ref>.supabase.co \
LAUNCH_SUPABASE_PUBLISHABLE_KEY=<chiave publishable di produzione> \
LAUNCH_SITE_URL=https://<dominio> \
LAUNCH_DATABASE_URL=<connessione al database di produzione, basta un ruolo in sola lettura> \
npx playwright test e2e/launch.spec.ts e2e/pending-actions.spec.ts
```

Fallisce se:
- `mailer_autoconfirm` non è `false`;
- gli accessi anonimi o l'email sono spenti;
- le iscrizioni sono chiuse;
- il CAPTCHA non è attivo;
- il cron risponde senza segreto;
- restano azioni in sospeso nelle pagine;
- nel database ci sono dati demo o di test (immagini demo comprese);
- un luogo in evidenza o un itinerario pubblicato non ha una foto vera, un media pubblico non ha il testo alternativo, una foto con licenza non ha autore e licenza, un bene culturale non ha un'autorizzazione valida, un luogo non ha una foto vera, un'area non ha la copertina o un luogo non ha l'area.

I template e il link dell'email si controllano a mano, come indicato nella tabella.

## 7. Chatbot (passo 9.1)

- **Chiave**: `ANTHROPIC_API_KEY` solo lato server (Vercel, ambiente di produzione). Senza chiave il chatbot è spento: `/api/chat` risponde 403 `chat_disabled` e l'interfaccia mostra lo stato spento.
- **Interruttore**: `CHAT_ENABLED=false` spegne il chatbot senza toccare la chiave.
- **Limite di messaggi**: 40 al giorno per utente, 10 per gli ospiti, 120 l'ora per IP. Il contatore è fail closed: se non risponde, la richiesta è rifiutata. Richiede `RATE_LIMIT_SECRET` (o `AFFILIATE_LINK_SECRET`).
- **Prezzi**: `AI_PRICES` in `src/server/chat/config.ts` sono valori indicativi per la stima dei costi nell'admin (`/admin/ai`). Verificarli sulla pagina prezzi di Anthropic prima del lancio e aggiornare la tabella. La stima non tiene conto della cache.
- **Modello di prova**: `CHAT_TEST_MODEL=scripted` è ignorato su Vercel (`VERCEL_ENV` presente). Serve solo per e2e e sviluppo locale.
- **Valutazione**: `npm run eval:chat` con `ANTHROPIC_API_KEY`, oppure il workflow manuale `chat-eval.yml`.

## 8. Ricerca: Search Console e Bing Webmaster

Dopo il primo deploy di produzione, per il dominio `NEXT_PUBLIC_SITE_URL`:

- **Verifica del dominio** (proprietà a livello di dominio, non di prefisso URL): nel DNS aggiungere il record TXT che Google Search Console e Bing Webmaster Tools mostrano in fase di verifica. Il record va aggiunto, non sostituito: i record TXT esistenti (SPF, altri servizi) restano.
- **Sitemap**: inviare `https://<dominio>/sitemap.xml` (indice). L'indice elenca una sitemap per tipo (`/sitemap/pagine.xml`, `luoghi`, `attivita`, `itinerari`, `aree`, `guide`, `voli`); `robots.txt` le dichiara tutte. Dopo l'invio, controllare che ogni sitemap risponda XML senza errori e che il numero di URL corrisponda ai contenuti pubblicati.
- **Dati strutturati**: controllare con il Rich Results Test di Google una scheda di attività, una di luogo, un itinerario pronto, una guida (articolo con autore e data) e la home (organizzazione). Nessun avviso di errore; gli avvisi sui campi facoltativi si valutano caso per caso.
- **Tag canonical**: le pagine con filtri nell'URL (`/attivita?...`) indicano la versione senza filtri; verificare nell'ispezione URL che Google scelga la pagina canonica attesa.
- **Bozze e pagine in sospeso**: le guide in bozza e le pagine ancora in sospeso non devono comparire nelle sitemap né essere indicizzate. Le aree senza descrizione restano nella sitemap (la sezione descrizione semplicemente non compare).

## 9. Shop: fornitore, API e IVA (passo 7)

Il modello è quello di un intermediario (docs/spec.md, sezione E-commerce): il cliente paga Isula, il fornitore magazzina e spedisce. Prima di aprire lo shop servono queste decisioni, che non si prendono nel codice.

- **Fornitore logistico (dropshipping)**: scegliere il fornitore e verificarne tempi di evasione, resi, giacenze e costo d'acquisto. Finché non c'è un contratto, l'ordine si inoltra a mano dal pannello admin (email o portale del fornitore), e si registrano corriere e tracking. Nessuna integrazione API viene attivata senza chiave: l'adattatore `api` (`SupplierAdapter`) resta inattivo come gli altri partner.
- **API del fornitore**: se il fornitore ne offre una, l'adattatore si implementa dietro l'interfaccia `SupplierAdapter` e si attiva solo con la chiave di produzione; prima si prova con il sandbox del fornitore. Chiavi e segreti in variabili d'ambiente, mai nel repository.
- **Contratto con il fornitore**: clausole su rimborsi al sito entro i tempi del recesso (14 giorni, esclusi i deperibili), gestione dei resi e delle contestazioni, responsabilità per la conformità alimentare e per la sicurezza dei prodotti, tempi di evasione, costo di spedizione coperto dalla tariffa (`SHIPPING_FLAT_CENTS`, `FREE_SHIPPING_THRESHOLD_CENTS` in `src/lib/shop/config.ts`).
- **Privacy**: il fornitore riceve indirizzo e contatto del cliente per evadere l'ordine. Va elencato come responsabile del trattamento in docs/PRIVACY-TECNICA (passo 8.2) e nell'informativa (passo 0.5). Le email al fornitore contengono solo i dati necessari.
- **IVA e fatturazione** (da decidere con il commercialista): aliquote per categoria (4, 10, 22% in `VAT_RATES`), prezzi IVA inclusa, Stripe Tax o aliquote fisse, fattura emessa dal sito anche quando spedisce il fornitore, soglia OSS oltre 10.000 € di vendite a distanza verso altri paesi UE (oggi la spedizione è solo in Italia).
- **Informazioni alimentari** (Reg. UE 1169/2011): prima di attivare un prodotto, verificare ingredienti e allergeni sull'etichetta del produttore. L'attivazione richiede la casella "Allergeni verificati" (regola nel server e nel database). Chi è operatore alimentare (fornitore e marchio) va verificato con il consulente.
- **Marchi e produttori**: prima di pubblicare una storia o una foto di un produttore serve un accordo scritto con lui (uso del nome, della storia e delle immagini), come previsto dai rischi in docs/spec.md.
- **Controlli di lancio**: nessun prodotto `[DEMO]` in produzione (il seed non si carica mai, `supabase db push` non esegue il seed); `npm run db:drift` e i test pgTAP `shop_rls` e `shop_catalog_rls` verdi in CI; import del catalogo reale solo dall'admin, con anteprima e nessun errore.
- **Prima di applicare le migrazioni dello shop in produzione** (`20261016202558_shop_catalog` e seguenti): verificare `select count(*) from products;` e `select count(*) from producers;`. Devono essere 0: le colonne NOT NULL senza default e la rimozione di `producers.lead_time_days` presuppongono tabelle vuote.

## 9b. Pagamenti: Stripe Checkout (passo 7.2)

Il carrello vive in un cookie firmato (`isula_cart`, solo id e quantità): i prezzi li legge il server dal database a ogni richiesta. Il checkout crea una riga in `checkout_sessions`, scala i punti (se richiesti) nella stessa transazione e poi crea la sessione Stripe. Se la sessione non si crea o non si collega, il server la annulla e restituisce i punti. Dettagli in `src/server/shop/checkout.ts`.

**Cron di riconciliazione** (`/api/cron/checkout-sweep`, ogni ora in `vercel.json`): chiude i checkout rimasti senza sessione Stripe più vecchi di 15 minuti (un crash tra la creazione della riga e la sessione) e restituisce i punti una sola volta. Verifica: `GET /api/cron/checkout-sweep` senza `Authorization` risponde 401.

**Limiti dei tentativi**: 10 checkout al giorno per utente e 30 all'ora per IP (`RATE_LIMIT_SECRET`, sopra).

**Rischi accettati**:
- Spam anonimo di righe: un visitatore senza account può creare righe in `checkout_sessions` senza sessione. Il rischio è accettato: lo limitano il rate limit per IP (30 all'ora) e il cron, che chiude le righe senza sessione dopo 15 minuti.
- Doppio guasto: se la sessione Stripe creata non si collega alla riga, e nemmeno il suo annullamento riesce, il cron può chiudere la riga (e restituire i punti) prima che Stripe scada la sessione (31 minuti). In quella finestra una sessione pagata darebbe lo sconto con i punti già restituiti. È una sessione per ogni doppio guasto; da chiudere con il passo 7.3, che potrà usare la scadenza come unica fonte.

| Variabile | Valore | Verifica |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_...` nelle anteprime e nei test; `sk_live_...` in produzione, solo dopo la prova end-to-end in modalità test | Senza, il pulsante "Paga" resta in sospeso e il carrello funziona. Il webhook rifiuta gli eventi in modalità diversa dalla chiave (`sk_live_` contro eventi di test, e viceversa). |
| `CHECKOUT_STRIPE_ENABLED` | `1` per accendere Stripe Checkout; altrimenti il pagamento resta spento anche con la chiave | Si imposta solo dal passo 7.3, quando il pagamento crea l'ordine. Con la chiave e senza il flag il pulsante resta in sospeso. |
| `STRIPE_WEBHOOK_SECRET` | segreto (`whsec_...`) dell'endpoint del webhook dello stesso ambiente: test e live hanno endpoint e segreti separati | Senza, `POST /api/stripe/webhook` risponde 500 `webhook_not_configured`. |
| `CART_SECRET` | stringa casuale lunga (es. `openssl rand -hex 32`) | In produzione è obbligatoria: senza, il carrello risponde "non disponibile". |
| `RATE_LIMIT_SECRET` (o `AFFILIATE_LINK_SECRET`) | già richiesta per i click affiliati | Limite dei tentativi di checkout: 10 al giorno per utente e 30 all'ora per IP. Senza chiave il checkout è negato (`rate_limited`). |

**Endpoint del webhook** (Stripe → Developers → Webhooks, una volta in modalità test e una in modalità live). Il webhook risponde 400 `livemode_mismatch` agli eventi in modalità diversa dalla chiave configurata:
- URL: `https://<dominio>/api/stripe/webhook`
- Eventi da abilitare: `checkout.session.expired` e `checkout.session.completed`. Il secondo si registra e non fa nulla finché non arriva il passo 7.3, che crea l'ordine.

**Prova end-to-end con Stripe CLI** (in locale, con `npm run dev` e `npm run db:start`):
1. `stripe login`, poi `stripe listen --forward-to localhost:3000/api/stripe/webhook`: la CLI stampa un `whsec_...`; mettilo in `.env.local` come `STRIPE_WEBHOOK_SECRET` e riavvia `npm run dev`.
2. Con `STRIPE_SECRET_KEY=sk_test_...` e `CHECKOUT_STRIPE_ENABLED=1` nel `.env.local`: aggiungi un prodotto al carrello, scegli "Paga con Stripe" e completa il pagamento con la carta di prova `4242 4242 4242 4242` (qualunque data futura e CVC). Il webhook riceve `checkout.session.completed`: nei log compare `stripe_event_recorded_not_handled`.
3. Scadenza: con una sessione ancora aperta, `stripe api post /v1/checkout/sessions/<id>/expire` (l'id `cs_test_...` è nell'URL di pagamento, o in `checkout_sessions.stripe_session_id`). Il webhook riceve `checkout.session.expired`.
4. Controllo nel database locale (sola lettura): `select status from checkout_sessions order by created_at desc limit 1;` deve dare `expired`; `select count(*) from points_ledger where reason = 'redeem_refund' and ref_id = '<checkout_id>';` deve dare `1` se l'account aveva usato punti. Rispedire lo stesso evento dalla CLI (`stripe events resend <evt_id>`) non deve cambiare nulla: `stripe_events` ha una sola riga per evento.

**Cosa non c'è ancora** (passi successivi): l'ordine e le email ai produttori (7.3), i rimborsi (7.4). Prima del lancio dello shop: decidere con il commercialista l'IVA e Stripe Tax (sezione 9); i prezzi sono IVA inclusa (`tax_behavior: inclusive`), senza calcolo automatico dell'imposta.

**Provider finto** (`CHECKOUT_TEST_PROVIDER=fake`): solo e2e e sviluppo, mai in produzione. Attivo solo se `VERCEL_ENV` non è impostata e se `NODE_ENV` non è `production`, oppure se `CI=true` (il job e2e di GitHub imposta `CI`, anche con `NODE_ENV=production`). Vince sulla chiave Stripe. La sessione punta a `/[locale]/carrello/prova-pagamento`, e la scadenza si simula con `POST /api/stripe/test-expire` (404 fuori dal provider finto).

## 10. Accessibilità (passo 11.4)

La verifica automatica (axe-core, WCAG 2.2 AA, `e2e/a11y.spec.ts`) copre le pagine principali in tema chiaro e scuro, a 1280 e 390 px. Non copre il resto: la verifica con lettori di schermo è da fare a mano prima del lancio, e non risulta ancora fatta.

Verifica manuale con lettore di schermo (VoiceOver su iOS e macOS, NVDA su Windows), su una build di produzione con un account di prova:

- **Onboarding** (`/it/viaggio/nuovo`): ogni domanda annuncia il titolo e il numero (1 di 7); le radio dei giorni e del periodo si leggono come gruppo con l'etichetta; "Avanti" annuncia lo stato disabilitato finché la risposta manca; il cambio di domanda sposta l'attenzione o l'annuncio.
- **Builder del viaggio** (`/it/viaggi/<id>`): i giorni sono pulsanti con il loro stato; lo spostamento di una tappa da tastiera annuncia la nuova posizione; i dialog "Togli il giorno" e "Elimina viaggio" annunciano titolo e descrizione e tornano al pulsante che li ha aperti.
- **Voti del gruppo**: il voto annuncia "Voto salvato: mi piace" (o preferirei altro), il voto tolto e il conteggio; un errore arriva con role="alert".
- **Salvataggi**: "Viaggio salvato" dopo "Salva il viaggio"; "Tappa aggiunta al giorno N" dopo "Aggiungi al viaggio"; "Impostazioni salvate" nelle impostazioni del viaggio; "Gusti salvati" in Preferenze.
- **Check-in**: l'esito (con i punti) arriva con role="status".
- **Chat** (`/it/chat`): il messaggio in corso viene letto mentre arriva, la risposta finale si legge una volta sola, l'errore con "Riprova" è annunciato.
- **Chat del viaggio**: il pannello si apre come dialog, Esc lo chiude e il focus torna al pulsante "Chiedi all'assistente".
- **Menu personale e menu delle azioni**: frecce, Home, Fine ed Esc; il focus torna al pulsante.
- **Dichiarazione di accessibilità e informativa**: il titolo è il primo annuncio della pagina; il segnaposto "Testo in preparazione" non va letto come testo vero.
- **Checkout**: non esiste ancora (passo 7). Quando arriva, questo elenco va esteso al carrello (aggiunta con annuncio di stato) e al pagamento.

Da chiudere prima del lancio: il testo della dichiarazione è scritto dall'orchestratore su incarico di Ludovico (2026-10-16) e va aggiornato dopo la prova con i lettori di schermo; il contatto per le segnalazioni arriva con i dati del titolare (CONTACT_EMAIL, passo 8.3).

## 11. Guide (contenuti da file, passo 8.3)

Le guide di `content/guide/*.md` si caricano nel database con `scripts/content/import-guides.mjs`, non con l'admin. Ogni file ha `slug` (uguale al nome del file), `title`, `summary`, `author` e `links` (`- place: <slug>`). Il comando fa upsert per slug, pubblica le guide, sostituisce i loro luoghi collegati e salta con un avviso i luoghi che non esistono.

| Voce | Valore | Verifica |
| --- | --- | --- |
| Migrazioni | applicate prima (`supabase db push`), altrimenti la tabella `guides` non c'è | `npm run content:guides -- --dry-run` mostra il piano e non scrive |
| Import in produzione | `DATABASE_URL` della produzione esportata nella shell (mai in `.env.local`), poi `npm run content:guides`; con host non locale il comando chiede conferma (`--yes` per saltarla) | Le guide compaiono in `/it/guide`; la sitemap `guide` elenca le otto guide. Un luogo mancante è nell'output come avviso "saltato". |

Una modifica al file si rilancia con lo stesso comando: aggiorna la guida con lo stesso slug.
