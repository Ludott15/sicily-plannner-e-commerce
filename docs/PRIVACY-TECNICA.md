# Privacy tecnica (passo 8.2)

Fonte per i testi legali del passo 8.3. Aggiornato al 2026-10-16. Le basi giuridiche sono ipotesi
da confermare con il consulente. Ragione sociale, sede, P.IVA e recapito privacy sono ancora da
definire (roadmap 0.2 e 8.3.3): questo documento non li contiene.

## 1. Dati trattati e finalità

| Categoria | Dove stanno (tabelle) | Finalità | Base giuridica (ipotesi) | Conservazione |
|---|---|---|---|---|
| Account | `auth.users`, `profiles` | Accesso, identità nel sito | contratto | fino all'eliminazione dell'account |
| Ospite | `auth.users.is_anonymous` | Usare il sito senza account | contratto / legittimo interesse | 30 giorni di inattività (cron `cleanup-guests`) |
| Preferenze esplicite | `user_constraints`, `preference_weights.explicit`, `profiles` (ritmo, compagnia) | Personalizzazione richiesta dall'utente | contratto | fino all'eliminazione |
| Dati sensibili (mobilità ridotta, dieta) | `user_constraints.reduced_mobility`, `diet` | Filtro rigido delle attività | art. 9.2.a, consenso esplicito | solo con consenso; cancellabili in ogni momento |
| Profilazione (eventi, pesi impliciti, profilo) | `user_events`, `preference_weights.implicit`, `user_taste` | Imparare i gusti dal comportamento | consenso (art. 6.1.a) | eventi 18 mesi; profilo fino a revoca |
| Consensi | `user_consents` | Prova dei consensi dati | obbligo di accountability | per tutta la durata dell'account (cancellata con l'account) |
| Viaggi, tappe, note | `itineraries`, `itinerary_items`, `itinerary_nights`, `itinerary_bookings` | Servizio | contratto | fino all'eliminazione |
| Gruppi, inviti, voti, proposte | `groups`, `group_members`, `group_invites`, `item_votes`, `itinerary_proposals`, `itinerary_changes` | Viaggio di gruppo | contratto | inviti scaduti da 30 giorni; resto fino all'eliminazione |
| Recensioni | `reviews` | Contenuto pubblico | contratto / legittimo interesse | fino all'eliminazione dell'account (poi senza autore) |
| Check-in | `check_ins` | Verifica della presenza, punti | consenso alla posizione | fino all'eliminazione. Le coordinate non si salvano |
| Punti e badge | `points_ledger`, `user_badges`, `season_awards` | Gamification | contratto | ledger cancellato con l'account; i premi di stagione restano senza utente |
| Chat | `chat_sessions`, `chat_messages`, `chat_proposals` | Assistente | contratto | 12 mesi senza attività |
| Click affiliati | `affiliate_clicks` | Attribuzione delle commissioni | contratto / legittimo interesse | 26 mesi con utente e anon_id; poi solo statistica |
| Notifiche | `notifications` | Esito proposte, badge | contratto | lette da 6 mesi; non lette fino all'eliminazione |
| Ordini (shop) | `orders` | Obbligo fiscale | obbligo legale (art. 2220 c.c.) | email e indirizzo di spedizione per 10 anni, poi anonimizzati (email neutra, spedizione vuota); importi, date e stato restano. Dopo l'eliminazione dell'account: utente vuoto (`set null`) |
| Registro admin | `admin_audit_log` | Tracciabilità delle azioni admin | obbligo / legittimo interesse | immutabile; l'attore diventa vuoto se l'account è eliminato |
| Ricerche senza risultato | `search_misses` | Migliorare il catalogo | legittimo interesse | non viste da 12 mesi |
| Anti-abuso | `rate_limit_hits` | Limiti di frequenza | legittimo interesse | un giorno; il bucket è un HMAC, nessun IP in chiaro |

## 2. Consensi

Il registro `user_consents` ha una riga per ogni scelta (immutabile, come il ledger). Lo stato attuale
è l'ultima riga per tipo. Si scrive solo con `public.record_consent` (SECURITY DEFINER); la RLS
mostra al proprietario le sue righe, a nessun altro.

| Tipo | Quando si chiede | Ospiti | Versione del testo (costanti in `src/lib/consents.ts`) |
|---|---|---|---|
| `profiling` | Fine dell'onboarding, e Account > Privacy. Default: non dato | sì | `profiling-2026-10-v1` |
| `location` | Alla prima conferma del check-in (il browser chiede la posizione) | sì | `location-2026-10-v1` |
| `sensitive` | Casella in Preferenze e onboarding (mobilità, dieta) | sì | `sensitive-2026-10-v1` |
| `newsletter` | Non ancora in uso | no | `newsletter-2026-10-v1` |
| `cookies_analytics` | Riservato al passo 11.7 | sì | `cookies-analytics-2026-10-v1` |

Il consenso ai dati sensibili esistente prima del registro è migrato con la versione `v0-legacy`, alla
data del consenso originale. Il testo dell'informativa sensibili dichiara il trasferimento ad
Anthropic (USA) quando l'assistente usa quei dati (`src/server/chat/tools.ts`, `get_user_profile`):
senza consenso i campi restano vuoti e non escono.

### 2.1 Profilazione

Senza consenso alla profilazione:

- nessuna riga in `user_events`: un trigger `BEFORE INSERT` (`user_events_consent_guard`) scarta la
  riga in silenzio. Vale per ogni scrittura: funzioni SQL dei click (affiliati, voli, vertical),
  azioni server (aggiungi e rimuovi tappa) e RLS. Il click affiliato resta in `affiliate_clicks`
  perché è un obbligo del contratto con il partner, non profilazione;
- il cron `learn` salta l'utente (`learn_from_events`): i suoi eventi non processati vengono segnati
  come processati, senza effetto su pesi e profilo;
- il profilo vettoriale non si usa per la similarità (la funzione non trova la riga);
- le preferenze esplicite (onboarding e pagina Preferenze) non sono profilazione e restano.

Alla revoca (`record_consent(profiling, false)` chiama `revoke_profiling`): cancellati gli eventi
dell'utente, pesi impliciti a zero, profilo cancellato. La riga di revoca resta nel registro.

Decisione aperta: gli eventi raccolti prima di questa versione da utenti senza consenso restano nella
tabella fino alla conservazione di 18 mesi, ma non sono usati. Cancellarli subito è irreversibile:
da confermare (vedi sezione 8).

### 2.2 Posizione

Le coordinate arrivano nella richiesta di check-in e non si salvano (`record_check_in` calcola la
distanza e le scarta). Il consenso alla posizione si registra alla prima richiesta di check-in.

## 3. Conservazione

Costanti in `src/server/privacy/retention.ts` (`RETENTION`). Il cron `/api/cron/retention` (ogni notte,
`vercel.json`) chiama `public.apply_retention` (ruolo postgres) e registra nel log solo i conteggi.

| Lavoro | Regola |
|---|---|
| `chat_sessions` | Eliminate, con messaggi e proposte, se l'ultima attività (ultimo messaggio o creazione) è oltre 12 mesi |
| `user_events` | Eliminati oltre 18 mesi |
| `affiliate_clicks` | Oltre 26 mesi: `user_id` e `anon_id` a null; partner, contesto e date restano |
| `group_invites` | Eliminati se scaduti da oltre 30 giorni |
| `search_misses` | Eliminati se non visti da 12 mesi |
| `notifications` | Eliminate se lette da oltre 6 mesi (non lette: restano) |
| `orders_personal_data` | Ordini oltre 10 anni: email sostituita con `anonimizzato@invalid.local`, indirizzo di spedizione a null |

Ospiti: eliminazione automatica dopo 30 giorni di inattività con tutti i dati (cron `cleanup-guests`).

La funzione è `public.apply_retention` (migrazione `20261016215936_gdpr_rls.sql`); le soglie sono in `RETENTION` (`src/server/privacy/retention.ts`).

## 4. Diritti: come si esercitano

### 4.1 Accesso e portabilità (Account > Privacy)

`GET /api/account/export?formato=json` scarica un JSON con: profilo, preferenze (vincoli, pesi
esplicito e implicito), consensi con le loro versioni, eventi di profilazione, viaggi (con giorni,
tappe, notti, prenotazioni e note), gruppi di cui si è membri (nome e ruolo, senza dati degli altri
membri), voti, proposte, recensioni, check-in (senza coordinate), punti, badge, notifiche, chat con
tutti i messaggi, click affiliati propri, ordini.

`formato=csv` scarica il solo ledger dei punti.

Il download è immediato e autenticato: nessun file salvato, quindi nessun link da proteggere.
Quota: 5 esportazioni al giorno per utente (`public.hit_rate_limit`, bucket HMAC con prefisso
`export:`, fail closed). Il profilo vettoriale e l'hash dei link di condivisione non sono esportati.

### 4.2 Cancellazione (Account > Privacy)

- Account con email: frase di conferma (`ELIMINA`, `DELETE` in inglese) e codice a 6 cifre inviato
  via email (`signInWithOtp`, `shouldCreateUser: false`, con CAPTCHA). Il codice si verifica sul
  server con `verifyOtp` (tipo `email`) prima di cancellare.
- Ospite: frase di conferma, nessun codice.
- `public.delete_my_account()` (SECURITY DEFINER, con `dbAsUser`):
  1. gruppi di cui l'utente è proprietario: passano al membro più vecchio (`transfer_group_ownership`),
     oppure, se il gruppo è vuoto, vanno via con i loro viaggi di gruppo;
  2. recensioni: restano con il testo e senza autore (`public_reviews.author_deleted`), mostrate come
     "Utente eliminato";
  3. `delete from auth.users`: cascade su profilo e su tutti i dati personali. Le tabelle immutabili
     (ledger dei punti, registro consensi) si cancellano per cascade, perché `prevent_mutation`
     ammette solo la cancellazione a cascata; `orders` e `admin_audit_log` restano con l'utente vuoto
     (`set null`), come richiesto dagli obblighi fiscali e di tracciabilità.
- Consigli locali firmati dall'utente: autore firmato "Autore eliminato", disattivato, senza profilo, bio, foto e consenso. Il kind diventa `editorial` (il check esige il consenso per `person`). I suoi consigli escono dalla vista pubblica; il testo resta in archivio, nascosto.
- Click affiliati dell'utente: via anche l'identificativo anonimo del browser (`anon_id`).
- Ospite: stessa cancellazione, senza codice; quota di 3 tentativi al giorno per utente (`userQuotaAllowed`, fail closed).
- Dopo l'esito: sessione locale rimossa, risposta di conferma.

Verifica: `supabase/tests/privacy_delete.test.sql` (cosa resta e cosa sparisce) e
`src/server/privacy/privacy.int.test.ts` (tabella per tabella, passaggio di proprietà, export senza
dati altrui).

## 5. Fornitori (aggiornato)

| Fornitore | Dati inviati | Paese |
|---|---|---|
| Supabase | Tutti i dati dell'account (regione del progetto da verificare) | da verificare |
| Vercel | Richieste HTTP, log, cron | USA (da verificare) |
| Anthropic | Testi della chat, profilo (ritmo, giorni, compagnia, budget, auto, interessi con pesi), titolo del viaggio, mobilità e dieta solo con consenso sensibili, aggregati del gruppo | USA |
| Voyage AI | Solo testi e coordinate delle attività del catalogo, nessun dato utente | USA |
| Resend | Email dell'invitato, nome del gruppo, nome di chi invita, link | USA |
| Cloudflare Turnstile | Dati del browser per il CAPTCHA | da verificare |
| Google (OAuth) | Identità per l'accesso con Google; copiati email, nome e avatar | USA |
| Travelpayouts / Aviasales, Viator, GetYourGuide, Civitatis, Booking.com, DiscoverCars | Solo il `subid` casuale nell'URL di uscita; per Aviasales anche aeroporti e date della ricerca | vari |
| OpenFreeMap | IP e user agent quando la mappa entra nello schermo | da verificare |

## 6. Nome pubblico

Alla registrazione con Google il `display_name` di default è la sola prima parola di `full_name`
(`handle_new_user`). Gli altri accessi copiano il nome come prima. I profili esistenti non cambiano.
Le recensioni mostrano il `display_name`; le classifiche mostrano le iniziali.

## 7. Cookie e archiviazione locale

| Nome | Tipo | Scopo | Durata |
|---|---|---|---|
| `sb-<progetto>-auth-token` | Tecnico | Sessione (utente o ospite) | 400 giorni |
| `cookie_consent` | Tecnico | Ricorda la scelta del banner | 182 giorni |
| `anon_id` | Non tecnico, solo con consenso accettato | Attribuire i click affiliati di chi non ha l'account | 365 giorni, HttpOnly |
| `NEXT_LOCALE` | Tecnico | Lingua | da verificare a runtime |

Il banner dice "altri cookie, per esempio per misurare le visite": oggi non esiste misurazione. Il
testo va corretto (namespace `Cookies`) prima della pubblicazione. Il consenso ai cookie governa
`anon_id` e l'evento di ricerca voli, non la profilazione (che ha il suo consenso).

Archiviazione del browser: `isula:onboarding` (bozza, rimossa all'invio), `isula.install.dismissed`,
`isula.punti.ultimaVisita`. Il service worker tiene in cache fino a cinque pagine dei viaggi (si
svuota al cambio di sessione e al logout); non salva pagine per gli ospiti.

## 8. Da decidere (irreversibili, per Ludovico e il consulente)

1. Eventi raccolti senza consenso prima di questa versione: cancellarli subito, o lasciarli fino alla
   conservazione di 18 mesi (oggi: non usati, ma presenti).
2. Consenso alla profilazione: scelta obbligatoria nell'onboarding o facoltativa (oggi facoltativa,
   default "non dato").
3. Ragione sociale, sede, recapito privacy, DPO (roadmap 0.2 e 8.3.3).
4. Età minima: nessun controllo oggi (vedi ricognizione, sezione 6).
5. Base del trasferimento verso USA (Anthropic, Vercel, Resend, Google, Voyage).
