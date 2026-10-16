# Specifica tecnica — Planner Sicilia + E-commerce

Sep 27, 2026 · @Ludovico · aggiornata il 28 settembre 2026

Nome di lavoro del brand: **Isula** (da verificare prima del lancio). Design system, manuale del brand, schemi di interazione e mockup sono in `docs/design/`: il punto di partenza è `docs/design/README.md`, e manuale, schemi e README dei componenti sono vincolanti. Il lavoro di design e contenuti rimandato è in `docs/design/BACKLOG.md`.

## Obiettivo e perimetro

Una piattaforma unica sotto un solo brand: planner di viaggi in Sicilia monetizzato con link affiliati, più shop di prodotti siciliani spediti dai produttori. Il planner conosce ogni utente tramite parametri configurabili e segnali di comportamento, e usa entrambi per proporre itinerari migliori.

Moduli inclusi nella prima versione:

- **Profilo e preferenze:** vincoli, pesi degli interessi, segnali impliciti.
- **Catalogo:** luoghi, attività, itinerari predefiniti.
- **Voli:** ricerca con prezzi in cache e link al partner.
- **Itinerary builder:** creazione e modifica giorno per giorno.
- **Chatbot AI:** conosce il profilo, sceglie solo dal catalogo.
- **Gruppi:** inviti, itinerario condiviso, voti.
- **Gamification:** punti, badge, leaderboard di gruppo e stagionale.
- **Shop:** prodotti e box, checkout Stripe, ordini inoltrati ai produttori.
- **Tracciamento affiliati:** ogni click in uscita registrato con subid.
- **Admin:** gestione di catalogo, itinerari, prodotti, ordini.

Fuori scope: vendita diretta di voli o hotel (richiede accreditamento IATA o licenza di agenzia), magazzino proprio, app mobile nativa (il sito è responsive e installabile come PWA), lingue diverse da italiano e inglese.

## Stack e convenzioni

Stesso stack di Segretaria AI (Next.js, Drizzle, Supabase), così i pattern di RLS, migrazioni e test già verificati si riusano senza reinventarli.

_(Diagramma originale: architettura con Next.js al centro e 5 servizi esterni — Supabase, Claude API, partner affiliati, Stripe, Resend.)_

Ogni chiamata a Claude, ai partner e a Stripe parte dal server. Il click affiliato passa sempre da /go/[id], così nessuna commissione resta senza tracciamento.

| Livello | Scelta | Note |
| --- | --- | --- |
| Framework | Next.js (ultima stabile), App Router, TypeScript strict | Server Components di default, Server Actions per le mutazioni |
| Hosting | Vercel | Cron per import catalogo e ricalcolo pesi |
| Database | Supabase Postgres + Drizzle ORM | Migrazioni SQL versionate, RLS su ogni tabella |
| Auth | Supabase Auth | Codice a 6 cifre via email (principale), magic link (alternativa), Google (nascosto nei browser interni delle app), accesso anonimo per gli ospiti con CAPTCHA Turnstile. Vedi "Accesso, ospiti e browser interni" |
| Vettori | pgvector | Embedding di attività e profili; provider di embedding esterno (es. Voyage AI) |
| AI | Claude API via SDK Anthropic | Streaming, tool calling |
| Pagamenti | Stripe Checkout + webhook | Nessun dato carta sul nostro server |
| Email | Resend | Conferme ordine, inviti, notifiche ai produttori |
| UI | Tailwind + shadcn/ui | Mobile first |
| Validazione | Zod | Ogni input di Server Action e route handler |
| Lingue | next-intl | Italiano, inglese |

Convenzioni:

- **Segreti solo lato server:** la service role key di Supabase si usa esclusivamente in cron e webhook.
- **Ogni mutazione:** validazione Zod, controllo dell'utente autenticato, poi scrittura. La RLS è la seconda difesa, non la prima.
- **Test:** Vitest per scoring e punti; test RLS in SQL, con lo stesso approccio di Segretaria AI.
- **CI:** controllo di drift dello schema tramite snapshot del dump SQL, non confronto sui file TypeScript.

## Struttura cartelle e route

Tre gruppi di route separano pubblico, area utente e admin; la logica di dominio vive in `src/server/`, mai dentro i componenti.

```
src/
  app/
    [locale]/
      (public)/
        page.tsx                    # home
        itinerari/page.tsx          # elenco itinerari predefiniti
        itinerari/[slug]/page.tsx   # dettaglio (SEO)
        attivita/page.tsx
        attivita/[slug]/page.tsx
        luoghi/[slug]/page.tsx
        voli/page.tsx               # ricerca voli
        shop/page.tsx
        shop/[slug]/page.tsx
        carrello/page.tsx
        invito/[token]/page.tsx     # accettazione invito gruppo
        produttore/spedizione/[token]/page.tsx  # conferma spedizione del produttore
      (app)/                        # richiede login
        onboarding/page.tsx         # questionario preferenze
        profilo/page.tsx
        profilo/preferenze/page.tsx
        viaggi/page.tsx             # i miei itinerari
        viaggi/[id]/page.tsx        # builder giorno per giorno
        gruppi/page.tsx
        gruppi/[id]/page.tsx        # itinerario condiviso, voti, classifica
        chat/page.tsx
        chat/[sessionId]/page.tsx
        classifica/page.tsx         # leaderboard stagionale
        ordini/page.tsx
      (admin)/admin/
        attivita/  itinerari/  luoghi/  prodotti/  produttori/  ordini/  utenti/
    api/
      chat/route.ts                 # streaming Claude
      go/[id]/route.ts              # redirect affiliato + log click
      flights/search/route.ts
      stripe/webhook/route.ts
      cron/import-catalog/route.ts
      cron/recompute-weights/route.ts
      cron/embed-activities/route.ts
  server/
    db/          schema/*.ts, client.ts, migrations/
    auth/        getUser, requireUser, requireAdmin
    personalization/  scoring.ts, weights.ts, constraints.ts
    ai/          tools.ts, system-prompt.ts, chat.ts
    affiliates/  travelpayouts.ts, getyourguide.ts, viator.ts, links.ts
    gamification/  points.ts, badges.ts, leaderboard.ts
    groups/      invites.ts, votes.ts, aggregate.ts
    shop/        checkout.ts, orders.ts, producers.ts
    email/       templates/, send.ts
  components/    ui/ (shadcn), itinerary/, chat/, shop/, groups/
  lib/           zod schemas, utils, i18n
```

Regole: ogni file in `app/` chiama funzioni di `server/`, non interroga il database direttamente. Le route `cron/*` verificano un header segreto (`CRON_SECRET`).

## Schema database (Drizzle)

Il vocabolario degli interessi (`interests`) è condiviso da attività e profili: è il ponte che rende possibile lo scoring. Lo schema sotto è in forma compatta; ogni tabella diventa un `pgTable` in `src/server/db/schema/`. Tutti gli id sono `uuid` con `gen_random_uuid()` salvo dove indicato; tutte le tabelle hanno `created_at timestamptz default now()`.

```
-- ENUM
user_role: user | admin
trip_pace: relaxed | balanced | intense
travel_party: solo | couple | family | friends
partner: travelpayouts | getyourguide | viator | car_rental | internal
itinerary_status: draft | planned | in_progress | completed
group_role: owner | member
invite_status: active | revoked | expired
point_reason: profile_completed | invite_accepted | review | check_in | itinerary_completed | order | redeem | redeem_refund | admin_adjust
order_status: pending | paid | sent_to_producer | shipped | delivered | cancelled | refunded
event_type: view | save | unsave | add_to_itinerary | remove_from_itinerary | affiliate_click | vote_up | vote_down | review

-- UTENTE E PERSONALIZZAZIONE
profiles: id (pk, = auth.users.id), display_name, avatar_url, locale, role user_role default user,
  home_airport_iata char(3), pace trip_pace, party travel_party, onboarding_completed_at
user_constraints: user_id (pk, fk profiles), budget_per_day_eur int, has_car bool,
  reduced_mobility bool, diet text[], max_daily_travel_min int, heat_tolerance smallint 0-5, crowd_tolerance smallint 0-5
interests: key text (pk), label_it, label_en, sort smallint
preference_weights: user_id, interest_key (fk interests), explicit smallint 0-5,
  implicit real default 0 (range -2..+2), updated_at; pk(user_id, interest_key)
user_taste: user_id (pk), embedding vector(1024), updated_at
user_events: id bigserial, user_id, type event_type, activity_id, itinerary_id, processed_at null

-- CATALOGO
places: slug unique, name, province char(2), lat, lng, description, cover_image
activities: slug unique, place_id (fk), title, description, duration_min int, price_from_eur numeric(8,2),
  requires_car bool, accessible bool, season_months smallint[], partner partner,
  partner_product_id text, affiliate_url text, rating numeric(2,1), embedding vector(1024),
  is_active bool default true, synced_at; unique(partner, partner_product_id)
  -- schema 2e: il catalogo è editoriale, le offerte sono dei partner. Da activities spariscono
  -- partner, partner_product_id e affiliate_url; price_from_eur diventa on_site_price_eur
  -- (prezzo pagato in loco: ingresso, biglietto), mostrato solo come metadato, mai come offerta.
activity_offers (schema 2e): activity_id (fk), partner partner, partner_product_id text, title,
  price_from_eur numeric(8,2), currency char(3), affiliate_url text, rating numeric(2,1) null,
  reviews_count int null, free_cancellation bool null, price_updated_at, is_active bool;
  unique(partner, partner_product_id); più offerte per attività
activity_interests: activity_id, interest_key, strength smallint 1-3; pk(activity_id, interest_key)

-- ITINERARI
itineraries: owner_id null (null = predefinito editoriale), group_id null, title, slug null unique,
  is_template bool, template_id null (fk itineraries), start_date date, days smallint, status itinerary_status,
  day_titles text[] (titolo editoriale di ogni giorno, al massimo days)
itinerary_items: itinerary_id (fk, cascade), day_index smallint, position smallint,
  activity_id null, place_id null, custom_title null, start_time time null, notes;
  check (activity_id or place_id or custom_title non null)

-- GRUPPI
groups: name, owner_id, itinerary_id null
group_members: group_id, user_id, role group_role, joined_at; pk(group_id, user_id)
group_invites: group_id, token_hash text unique, email null, invited_by, expires_at,
  max_uses smallint default 10, uses smallint default 0, status invite_status
item_votes: itinerary_item_id, user_id, value smallint (-1 | 1); pk(itinerary_item_id, user_id)

-- GAMIFICATION
points_ledger: id bigserial, user_id, delta int, reason point_reason, ref_type text, ref_id uuid,
  season text (es. '2027-estate'); unique(user_id, reason, ref_id)
badges: key text (pk), name_it, name_en, description, criteria jsonb
user_badges: user_id, badge_key, awarded_at; pk(user_id, badge_key)
check_ins: user_id, place_id, itinerary_id null, lat, lng
reviews: user_id, activity_id, rating smallint 1-5, body; unique(user_id, activity_id)

-- AFFILIATI
affiliate_clicks: user_id null, activity_id null, offer_id null (schema 2e), partner, target_url, subid text unique,
  context text (page | itinerary | chat | flights), itinerary_id null, anon_id text
affiliate_conversions: partner, subid, amount_eur, commission_eur, status, reported_at

-- SHOP
producers: name, email, vat_number, address, lead_time_days smallint, is_active
products: slug unique, producer_id, title, description, price_cents int, weight_g int,
  images text[], is_box bool, is_active bool, stripe_price_id
orders: user_id null, email, status order_status, subtotal_cents, discount_cents, shipping_cents,
  total_cents, points_redeemed int default 0, stripe_session_id unique, shipping_address jsonb
order_items: order_id (fk, cascade), product_id, producer_id, quantity, unit_price_cents
order_shipments: order_id, producer_id, token_hash unique, carrier null, tracking_number null,
  shipped_at null; pk(order_id, producer_id)
admin_audit_log: actor_id, action text, entity text, entity_id uuid, diff jsonb

-- CONSIGLI LOCALI (schema 2e)
local_tip_author_kind: editorial | person
local_tip_authors: kind local_tip_author_kind, display_name, bio, photo_url null, profile_id null,
  consent_at null, is_active; check (kind = person richiede consent_at)
local_tips: author_id, activity_id null, place_id null, body (max 280 caratteri), author_relation null,
  verified_at date, is_active; check (activity_id o place_id non null);
  trigger: author_relation obbligatoria se l'autore è di tipo person

-- PRENOTAZIONI DELL'ITINERARIO (schema 2e)
booking_kind: activity | lodging | car | flight
booking_status: to_book | booked
itinerary_bookings: itinerary_id, kind booking_kind, activity_id null, partner, status booking_status,
  updated_by, updated_at

-- AI
chat_sessions: user_id, itinerary_id null, title
chat_messages: session_id (fk, cascade), role text, content jsonb, tool_calls jsonb null
```

Indici obbligatori:

- `activities.embedding` e `user_taste.embedding`: indice HNSW (`vector_cosine_ops`).
- `activities(place_id)`, `activities(is_active, partner)`.
- `itinerary_items(itinerary_id, day_index, position)`.
- `points_ledger(season, user_id)` per la leaderboard.
- `user_events(user_id) where processed_at is null` per il ricalcolo dei pesi.
- `affiliate_clicks(created_at)` e `affiliate_conversions(subid)`.

## RLS e sicurezza

RLS attiva su ogni tabella senza eccezioni; il client usa solo la chiave anonima, e le scritture sensibili (punti, ordini, click, conversioni) passano da codice server con service role o da funzioni `SECURITY DEFINER`.

Funzioni di supporto, tutte `SECURITY DEFINER` con `SET search_path = public, pg_temp`:

- `is_admin()`: vero se `profiles.role = 'admin'` per `auth.uid()`.
- `is_group_member(gid uuid)`: vero se esiste la riga in `group_members`.
- `can_access_itinerary(iid uuid)`: proprietario, oppure membro del gruppo collegato, oppure itinerario template pubblico.
- `award_points(uid, delta, reason, ref_type, ref_id)`: unica via di scrittura del ledger, idempotente grazie al vincolo unique.
- `accept_invite(token text)`: verifica hash, scadenza e usi, inserisce il membro, incrementa `uses` in una sola transazione.

| Tabelle | Lettura | Scrittura |
| --- | --- | --- |
| profiles, user\_constraints, preference\_weights, user\_taste | Solo il proprietario (profiles: anche nome e avatar dei compagni di gruppo) | Solo il proprietario; `role` modificabile solo da admin |
| user\_events | Nessuna dal client | Insert del proprietario; processamento solo server |
| interests, places, activities, activity\_interests, badges | Pubblica se attiva | Solo admin |
| itineraries, itinerary\_items | `can_access_itinerary` | Proprietario; membri del gruppo sugli itinerari di gruppo |
| groups, group\_members | Membri | Owner per modifiche e rimozioni; ingresso solo via `accept_invite` |
| group\_invites | Owner del gruppo | Owner del gruppo |
| item\_votes | Membri del gruppo dell'itinerario | Il votante, solo sul proprio voto |
| points\_ledger, user\_badges | Proprietario; aggregati via vista leaderboard | Solo `award_points` e codice server; nessun update o delete per nessun ruolo, `postgres` compreso (trigger di immutabilità). Unica eccezione: la cancellazione a cascata quando si elimina l'account |
| check\_ins | Proprietario | Solo tramite funzione server (distanza, un check-in per luogo al giorno, massimo 5 al giorno); nessun insert diretto dal client |
| reviews | Proprietario sulla tabella; lettura pubblica tramite la vista `public_reviews` (nome e avatar dell'autore, mai `user_id`) | Solo tramite `submit_review` (dalla milestone 9); modifica e cancellazione del proprietario |
| affiliate\_clicks, affiliate\_conversions | Solo admin | Solo server |
| producers | Solo admin | Solo admin |
| products | Pubblica se attivo | Solo admin |
| orders, order\_items | Proprietario | Solo webhook Stripe (service role) |
| chat\_sessions, chat\_messages | Proprietario | Proprietario (sessioni); messaggi solo server |
| local\_tip\_authors, local\_tips | Pubblica tramite la vista `public_local_tips` (solo consigli attivi e verificati negli ultimi 12 mesi, con i campi pubblici dell'autore); vista admin dei consigli che scadono entro 30 giorni | Solo admin |
| itinerary\_bookings | `can_access_itinerary` | `can_edit_itinerary`; lo stato lo segna l'utente, non riceviamo conferme dai partner |

**Ospiti (accesso anonimo):** possono creare e modificare i propri itinerari e prenotazioni; non possono creare o entrare in gruppi, invitare, recensire, fare check-in né accumulare punti. Nelle policy interessate la condizione è `not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false)`, con un test pgTAP per ogni restrizione.

Altre regole:

- **Token di invito:** generati con 32 byte casuali, salvati solo come hash SHA-256. Il token in chiaro esiste solo nel link.
- **Leaderboard:** esposta tramite una vista, leggibile solo dagli utenti autenticati, che mostra solo nome visualizzato, avatar e totale punti, mai lo storico del ledger.
- **Webhook Stripe:** verifica della firma obbligatoria; elaborazione idempotente sulla chiave `stripe_session_id`.
- **Rate limit:** su `/api/chat`, `/api/go` e creazione inviti, per utente e per IP.
- **Test:** una suite SQL che verifichi per ogni tabella che un utente non possa leggere o scrivere dati di altri, incluso il caso di un ex membro di gruppo.

## Accesso, ospiti e browser interni

Il traffico arriva in buona parte dai browser interni di TikTok e Instagram: lì Google blocca l'OAuth, e un magic link si apre in un altro browser, dove la sessione non serve. Le regole di interazione sono in `docs/design/brand/schemi.md` ("Arrivi dai social"). Questa sezione modifica la milestone 1.

- **Ospite:** chi usa il sito senza account riceve una sessione anonima (`signInAnonymously`), protetta da CAPTCHA Turnstile come raccomanda Supabase. Può creare, salvare e modificare i propri itinerari.
- **Accesso principale con codice a 6 cifre via email** (`signInWithOtp` + `verifyOtp`, template email con il codice), digitato nella stessa pagina. Il magic link resta come alternativa.
- **Da ospite ad account:** `updateUser` con l'email e verifica del codice. L'user id resta lo stesso, quindi itinerari, preferenze e ogni altro dato restano suoi.
- **Google nascosto nei browser interni** (Instagram, Facebook, TikTok), con l'invito "Apri nel browser". Il rilevamento dallo user agent sta in un modulo con test unitari.
- **Limiti degli ospiti (RLS):** niente gruppi (né creazione né ingresso), inviti, recensioni, check-in e punti. Vedi la sezione RLS.
- **Pulizia:** un cron elimina gli ospiti inattivi da 30 giorni con i loro dati (`public.delete_inactive_guests`: inattività = creazione, ultimo accesso o ultimo rinnovo di una sessione).
- **Test e2e:** ospite → crea un itinerario → registrazione con codice → l'itinerario è ancora suo.

## Motore di personalizzazione

I vincoli filtrano, i pesi ordinano, il comportamento corregge i pesi ogni notte. Tutta la logica è codice deterministico in `server/personalization/`; l'AI la usa, non la sostituisce.

**Parametri configurabili dall'utente** (onboarding in 6-8 schermate, modificabili in Preferenze):

- **Vincoli rigidi:** budget giornaliero, auto sì/no, mobilità ridotta, dieta, minuti massimi di spostamento al giorno.
- **Pesi 0-5 per interesse:** mare, cibo e vino, storia e archeologia, natura ed escursioni, borghi, arte, vita notturna, esperienze locali, relax. L'elenco vive nella tabella `interests`, quindi si estende senza migrazioni.
- **Stile:** ritmo (rilassato, equilibrato, intenso), con chi viaggi, tolleranza a caldo e folla.

**Passo 1, filtro.** Scarta le attività fuori stagione, che richiedono l'auto se l'utente non ce l'ha, non accessibili con mobilità ridotta, con prezzo oltre il budget giornaliero.

**Passo 2, punteggio.** Il peso effettivo per interesse è w = clamp(explicit + implicit, 0, 5). La corrispondenza con gli interessi, con s = forza del tag (1-3):

```latex
\text{match}(a,u) = \frac{\sum_k s_{a,k} \, w_{u,k}}{5 \sum_k s_{a,k}}
```

```latex
\text{score} = 0.55\,\text{match} + 0.20\,\cos(e_a, e_u) + 0.15\,\frac{\text{rating}}{5} + 0.10\,\text{fit}
```

`fit` misura quanto prezzo e durata si adattano a budget e ritmo (1 = perfetto, 0 = al limite). Con meno di 5 eventi registrati il termine di similarità vale 0 e il suo peso passa a `match`. I coefficienti stanno in un file di configurazione, non nel codice.

**Passo 3, composizione dell'itinerario.** Algoritmo greedy giorno per giorno:

1. Tempo disponibile al giorno dal ritmo: rilassato 4 ore, equilibrato 6, intenso 8.
2. Ogni giorno ha una zona base (provincia o gruppo di luoghi vicini) per rispettare i minuti di spostamento.
3. Si aggiungono le attività col punteggio più alto finché c'è tempo.
4. Diversità: al massimo 2 attività con lo stesso interesse principale nello stesso giorno, nessuna attività ripetuta nel viaggio.
5. Se l'auto è necessaria e l'utente non la ha selezionata, l'itinerario propone il noleggio (link affiliato) invece di scartare la zona.

**Passo 4, apprendimento.** Un cron notturno legge `user_events` non processati e aggiorna `implicit` per ogni interesse dell'attività coinvolta, proporzionalmente alla forza del tag:

| Evento | Variazione |
| --- | --- |
| affiliate\_click | +0.5 |
| add\_to\_itinerary | +0.4 |
| save | +0.3 |
| vote\_up | +0.2 |
| view | +0.05 |
| vote\_down | -0.3 |
| remove\_from\_itinerary | -0.4 |
| review | (voto - 3) × 0.3 |

Prima di sommare, `implicit` decade del 5% a ogni ricalcolo e resta tra -2 e +2: il comportamento recente pesa più di quello vecchio e non può mai azzerare quello che l'utente ha dichiarato. Lo stesso cron ricalcola `user_taste.embedding` come media degli embedding delle attività con interazioni positive negli ultimi 90 giorni.

**Utente non registrato:** usa il sito come ospite, con una sessione anonima di Supabase: onboarding, preferenze e itinerari si salvano nel database sotto il suo user id e si usano con lo stesso algoritmo. Alla registrazione l'account mantiene lo stesso user id e quindi tutti i dati (vedi "Accesso, ospiti e browser interni").

## Chatbot AI

Il chatbot è un'interfaccia conversazionale sopra il motore di personalizzazione: legge il profilo, interroga il catalogo tramite strumenti e non scrive mai un nome di attività, un prezzo o un link che non arrivi da uno strumento.

**Flusso di una richiesta** su `/api/chat`: autenticazione e rate limit, caricamento della sessione, costruzione del contesto (system prompt + riepilogo profilo + ultimi 20 messaggi), chiamata a Claude in streaming con gli strumenti, esecuzione degli strumenti lato server, salvataggio di messaggi e chiamate in `chat_messages`.

**Modelli:** un modello di fascia Sonnet per la conversazione, uno di fascia Haiku per compiti brevi (titolo della sessione, riassunto della cronologia oltre i 20 messaggi). Prompt caching attivo sul system prompt.

| Strumento | Input | Output | Effetto |
| --- | --- | --- | --- |
| get\_user\_profile | nessuno | vincoli, pesi effettivi, ritmo, compagnia | Lettura |
| search\_activities | query testuale, luogo, interessi, prezzo massimo, data, limite | attività già filtrate e ordinate con lo scoring | Lettura |
| get\_activity | id | dettaglio completo | Lettura |
| search\_flights | aeroporto di partenza, aeroporto siciliano (CTA, PMO, TPS, CIY), date | prezzi in cache con data di aggiornamento | Lettura |
| propose\_itinerary | giorni, data di inizio, zone preferite | bozza generata dall'algoritmo greedy, non salvata | Lettura |
| get\_itinerary | id | itinerario con giorni e voci | Lettura |
| apply\_itinerary\_changes | id, lista di aggiunte, rimozioni, spostamenti | proposta di modifica | Richiede conferma dell'utente nell'interfaccia |
| suggest\_preference\_update | interesse, nuovo peso, motivo | proposta di modifica | Richiede conferma dell'utente nell'interfaccia |
| search\_products | query | prodotti dello shop | Lettura; al massimo una proposta per sessione |

**Regole del system prompt** (in `server/ai/system-prompt.ts`):

- Attività, prezzi, orari e voli si citano solo dai risultati degli strumenti. Se uno strumento non restituisce nulla, lo si dice.
- Le attività si citano con un riferimento `[[activity:<id>]]`; l'interfaccia lo trasforma in una scheda con il link tracciato `/go/<id>`. Il modello non scrive mai URL.
- Nessuna modifica a itinerari o preferenze senza passare dagli strumenti che richiedono conferma.
- Risposte brevi, nella lingua dell'utente, con al massimo 5 proposte per volta.
- Lo shop si propone solo se pertinente alla conversazione, non come chiusura fissa.
- Parole vietate del manuale (`docs/design/brand/manuale.md`, "Voce e contenuti"): valgono anche per le risposte del chatbot.
- Nei viaggi di gruppo gli strumenti restituiscono solo preferenze aggregate e il modello cita solo motivi aggregati; con meno di 3 membri solo motivi logistici. Nessuno strumento restituisce le preferenze di un altro membro.

**Costi:** limite giornaliero di messaggi per utente in configurazione; log di token in ingresso e in uscita per sessione, così si misura il costo per utente attivo prima di decidere se renderlo un servizio a pagamento.

## Voli, attività e tracciamento affiliati

Ogni link in uscita verso un partner passa da una route nostra che registra il click e assegna un subid univoco: è l'unico modo per sapere quali pagine, itinerari e risposte del chatbot generano commissioni.

**Voli**

- Ricerca tramite l'API dati di Travelpayouts (Aviasales): prezzi in cache, non in tempo reale. L'interfaccia mostra sempre "prezzo indicativo, aggiornato il ...".
- Destinazioni fisse: Catania (CTA), Palermo (PMO), Trapani (TPS), Comiso (CIY), Lampedusa (LMP), Pantelleria (PNL).
- Risultati memorizzati in cache lato server per 6 ore per coppia di aeroporti e date (data cache di Next con `revalidate`, nessuna tabella: le richieste anonime non scrivono nel database), così si rispettano i limiti dell'API.
- La prenotazione avviene sempre sul sito del partner, tramite `/api/go/flight`.

**Import del catalogo attività**

1. Cron notturno `import-catalog`: scarica i prodotti dei partner per le destinazioni siciliane e fa upsert delle **offerte** (`activity_offers`) su `(partner, partner_product_id)`. Ogni prodotto si collega a un'attività esistente del catalogo; solo se non corrisponde a nessuna, l'import crea un'attività nuova, inattiva e da rivedere nella coda dell'admin.
2. Le attività nuove entrano con `is_active = false`. Un modello Haiku propone i tag di interesse con la forza; l'admin li conferma. Senza tag lo scoring non funziona, quindi nessuna attività va online senza.
3. Le offerte non più restituite dal partner per 3 import consecutivi vengono disattivate; l'attività resta, perché è editoriale.
4. Cron `embed-activities`: calcola l'embedding per le attività nuove o modificate.
5. Le attività curate a mano usano gli stessi campi e possono non avere offerte: in quel caso la pagina non mostra né `AffiliateOffer` né l'offerta nella barra mobile.

**Route di uscita `/api/go/[id]`**

1. Risolve l'offerta (`activity_offers`); se non esiste, è spenta o la sua attività è inattiva, rimanda al catalogo; se la registrazione fallisce, alla pagina dell'attività con un avviso.
2. Genera un subid breve e univoco.
3. Costruisce l'URL finale aggiungendo il subid nel parametro previsto da quel partner; la mappatura dei parametri vive in `server/affiliates/links.ts`.
4. Registra la riga in `affiliate_clicks` con utente o identificativo anonimo (cookie `anon_id`, solo con il consenso ai cookie non tecnici: senza consenso il click ha il solo subid), offerta, contesto e itinerario.
5. Registra l'evento `affiliate_click` in `user_events` se l'utente è autenticato.
6. Risponde con redirect 302.

Per i voli, `/api/go/flight` riceve i parametri firmati con HMAC dal server che ha generato il risultato. Nessuna route accetta un URL di destinazione arbitrario: niente open redirect.

**Conversioni:** un cron giornaliero importa i report dei partner (API o CSV caricato dall'admin) in `affiliate_conversions` e li collega ai click tramite subid. La dashboard admin mostra commissioni per contesto (pagina, itinerario, chat, voli), per attività e per partner.

## Gruppi, inviti e voti

Un gruppo è un viaggio condiviso: un itinerario, più membri, voti sulle attività e una classifica interna. Ogni invito accettato porta un nuovo utente, quindi è anche il principale canale di crescita gratuito.

**Creazione:** l'utente crea un gruppo da un suo itinerario o da zero; diventa owner e l'itinerario viene collegato tramite `groups.itinerary_id` e `itineraries.group_id`.

**Invito:**

1. L'owner genera un link (valido 7 giorni, fino a 10 usi) o invia un invito via email.
2. Chi apre `/invito/[token]` vede nome del gruppo, owner e anteprima dell'itinerario anche senza account.
3. Se non registrato, passa da registrazione e onboarding, poi torna all'invito.
4. `accept_invite(token)` inserisce il membro; `award_points` assegna i punti `invite_accepted` a chi ha invitato, una sola volta per coppia di utenti.

**Preferenze del gruppo** (calcolate in `server/groups/aggregate.ts`, mai salvate):

- **Vincoli:** vince il più restrittivo. Budget minimo tra i membri, mobilità ridotta se almeno un membro la indica, unione delle diete, auto solo se almeno un membro ce l'ha.
- **Pesi:** media dei pesi effettivi dei membri, con un minimo: un interesse a cui almeno un membro ha dato 5 non scende sotto 2, così nessuno resta senza qualcosa che ama.

**Motivi "Per il gruppo":** ogni suggerimento in un viaggio di gruppo spiega perché è adatto con motivi **solo aggregati** ("Natura tra i primi interessi di 3 su 4 · 25 min dalla base"). Con meno di 3 membri si mostra solo il motivo logistico, perché con 2 persone l'aggregato rivelerebbe le risposte dell'altro. **Nessuna API restituisce le preferenze di un altro membro:** `aggregate.ts` restituisce solo valori aggregati. Vale per lo scoring di gruppo (milestone 4) e per il chatbot (milestone 7).

**Ospiti:** un ospite che apre un invito deve prima creare l'account con il codice email; i suoi dati da ospite restano.

**Voti:** ogni membro vota +1 o -1 su ogni voce dell'itinerario. L'interfaccia mostra il saldo e segnala come candidate alla sostituzione le voci con voti contrari pari ad almeno la metà dei membri attuali del gruppo ("2 su 4 preferirebbero altro. Ecco 2 alternative vicine."), proponendo alternative con lo scoring di gruppo. Solo l'owner applica le sostituzioni; ogni membro può proporre aggiunte.

**Realtime:** sottoscrizione Supabase Realtime a `itinerary_items` e `item_votes` filtrata per itinerario, così modifiche e voti compaiono subito a tutti i membri aperti sulla pagina.

**Uscita e rimozione:** un membro può uscire; l'owner può rimuovere membri e trasferire la proprietà prima di uscire. I voti di chi esce restano ma non contano nel saldo. Dopo l'uscita la RLS toglie ogni accesso immediatamente.

## Gamification e leaderboard

I punti premiano azioni che fanno crescere la piattaforma o arricchiscono il catalogo, e si spendono come sconto nello shop: è il ponte che tiene vivo l'utente tra un viaggio e l'altro.

| Azione | Punti | Condizione anti-abuso |
| --- | --- | --- |
| Profilo completato | 50 | Una volta per utente |
| Invito accettato | 100 | Solo quando l'invitato completa l'onboarding; una volta per coppia |
| Itinerario completato | 100 | Almeno 3 check-in nell'itinerario |
| Recensione | 20 | Attività presente in un tuo itinerario o cliccata; almeno 80 caratteri |
| Check-in | 10 | GPS entro 300 m dal luogo; una volta per luogo al giorno; massimo 5 al giorno |
| Ordine nello shop | 1 per euro | Accreditati solo quando l'ordine risulta consegnato |

Tutti i valori stanno in configurazione. Ogni assegnazione passa da `award_points`, che grazie al vincolo `unique(user_id, reason, ref_id)` non può accreditare due volte la stessa azione.

`award_points` non è eseguibile dal client. Le azioni dell'utente che danno punti (check-in, recensione) passano da funzioni SQL `SECURITY DEFINER` dedicate, chiamate dal server con `dbAsUser`: la funzione verifica le condizioni anti-abuso, scrive la riga (check-in o recensione) e chiama `award_points` nella stessa transazione. I punti che dipendono da eventi esterni (ordine consegnato, invito accettato dopo l'onboarding, itinerario completato) li accredita il codice server con `dbAdmin`.

Decisioni per la milestone 9 (Gamification):

- **Recensioni solo tramite `submit_review`:** l'insert diretto in `reviews` dal client viene revocato. Il requisito "attività presente in un tuo itinerario o cliccata" vale per pubblicare la recensione, non solo per ottenere i punti; il minimo di 80 caratteri resta una condizione dei punti.
- **Utente ricavato da `auth.uid()`:** `record_check_in` e `submit_review` leggono l'utente dentro la funzione, mai da un parametro. Test obbligatorio: un utente non può fare check-in o recensioni a nome di un altro.

**Recensione con premio:** `public_reviews` espone `rewarded` (vero per le recensioni che hanno generato punti) e l'interfaccia mostra l'etichetta "Recensione con premio". Il premio non dipende dal voto dato.

**Ospiti:** non accumulano punti né recensiscono o fanno check-in; lo fanno dopo aver creato l'account.

**Conversione in sconto:** 100 punti = 1 euro, massimo 15% del totale dell'ordine. Al checkout il server crea un coupon Stripe monouso e registra una riga `redeem` con delta negativo; se l'ordine viene annullato, una riga redeem\_refund con delta positivo restituisce i punti.

**Badge** (criteri in `badges.criteria`, valutati dal server dopo ogni assegnazione di punti), esempi iniziali:

- Primo viaggio: un itinerario completato.
- Esploratore dell'Etna: 5 check-in in provincia di Catania.
- Nove su nove: almeno un check-in in ciascuna delle 9 province.
- Buongustaio: 5 attività con interesse cibo e vino completate.
- Organizzatore: un gruppo con almeno 4 membri.

**Leaderboard:**

- **Di gruppo:** punti guadagnati dai membri durante il viaggio del gruppo, visibile nella pagina del gruppo. È quella che conta davvero.
- **Stagionale:** due stagioni l'anno, estate (aprile-settembre) e inverno (ottobre-marzo). Mostra i primi 50 e la posizione dell'utente. A fine stagione i primi 10 ricevono un premio (per esempio una box), che è anche materiale per i contenuti social.
- Il calcolo usa una vista materializzata su `points_ledger` aggiornata ogni 15 minuti, non query in tempo reale.
- Ogni utente può scegliere di non comparire nella classifica stagionale.

## E-commerce

Lo shop vende box e prodotti che il produttore spedisce direttamente: noi incassiamo con Stripe, inoltriamo l'ordine e seguiamo il cliente. Niente magazzino e nessun motore e-commerce esterno.

**Modello di vendita (deciso il 2026-10-16): intermediario.** Il prodotto si compra da un **fornitore** logistico che gestisce magazzino e spedizione (come un servizio di dropshipping). Il cliente paga Isula; Isula inoltra l'ordine al fornitore, che spedisce al cliente. Il **produttore** (marchio di origine: chi fa il prodotto, con la sua storia e il territorio) è un'informazione editoriale distinta dal fornitore. Il fornitore non compare mai nelle pagine pubbliche; il costo d'acquisto è solo admin. Un adattatore `api` resta inattivo finché non si sceglie il fornitore (docs/LANCIO.md, sezione 9). Spedizione solo in Italia nella prima versione, con tariffa fissa per ordine e soglia gratuita. Il recesso è di 14 giorni, esclusi i prodotti deperibili; i prodotti attivi richiedono gli allergeni dichiarati.

**Carrello e checkout:**

1. Il carrello vive in un cookie firmato; il checkout è possibile anche senza account.
2. Il server crea la sessione Stripe Checkout leggendo prezzi e disponibilità dal database, mai dal client.
3. Spedizione solo verso l'Italia nella prima versione; tariffa fissa per ordine e soglia di spedizione gratuita (`src/lib/shop/config.ts`).
4. Se l'utente è autenticato e sceglie di usare i punti, il server applica il coupon monouso (sezione Gamification).
5. Stripe raccoglie indirizzo, email e telefono.

**Webhook `checkout.session.completed`:**

1. Verifica della firma, poi controllo di idempotenza su `stripe_session_id`.
2. Crea `orders` con stato `paid` e le righe `order_items` con il produttore di ciascun prodotto.
3. Per ogni produttore coinvolto invia un'email con elenco prodotti, indirizzo e un link unico `/produttore/spedizione/[token]`; stato `sent_to_producer`.
4. Invia la conferma d'ordine al cliente.

**Spedizione:** il produttore apre il link, inserisce corriere e numero di tracking, e l'ordine passa a `shipped` con email al cliente. Se il produttore non conferma entro il suo `lead_time_days`, l'admin riceve un avviso. L'ordine passa a `delivered` su conferma dell'admin o in automatico 10 giorni dopo la spedizione; solo allora si accreditano i punti.

**Annullamenti e rimborsi:** l'admin avvia il rimborso dal pannello, il server chiama l'API di rimborso di Stripe, l'ordine passa a `refunded` e gli eventuali punti usati vengono restituiti.

**Pagine prodotto:** foto, storia del produttore, ingredienti e allergeni, formato, conservazione. Dati strutturati Product per la SEO. Collegamenti incrociati con luoghi e attività (il pistacchio porta a Bronte e viceversa).

## Admin

Un solo ruolo `admin` (tu) nella prima versione; il pannello serve a tenere il catalogo pulito e gli ordini in movimento, non a fare analisi complesse.

| Sezione | Funzioni |
| --- | --- |
| Attività | Coda delle attività importate da approvare, con tag proposti dall'AI da confermare o correggere; modifica, attivazione, disattivazione; creazione di attività curate |
| Luoghi | Creazione e modifica, coordinate, immagine, provincia |
| Itinerari | Creazione degli itinerari predefiniti con editor giorno per giorno; pubblicazione con slug per la SEO |
| Interessi e badge | Elenco interessi con etichette; badge con criteri |
| Prodotti e produttori | Schede prodotto, prezzi, attivazione; anagrafica produttori con tempi di spedizione |
| Ordini | Elenco per stato, dettaglio, spedizioni in ritardo evidenziate, rimborso, cambio stato manuale |
| Affiliati | Click e commissioni per contesto, attività e partner, per periodo; caricamento CSV dei report partner |
| Utenti | Ricerca, dettaglio, rettifica punti (`admin_adjust` con motivazione obbligatoria) |
| AI | Costo in token per giorno e per utente; ultime sessioni per controllare la qualità delle risposte |

Ogni azione dell'admin che modifica punti, ordini o stato delle attività viene registrata con autore e data.

## Ordine di sviluppo per Antigravity

Tredici milestone in sequenza (le dodici originali più il design system tra la 2 e la 3); ognuna è chiusa solo quando i criteri verificabili passano, non quando l'agente dichiara di aver finito. Ogni milestone parte da un branch dedicato e finisce con i test verdi in CI.

- **M1 — Fondamenta.** Next.js, TypeScript strict, Tailwind, shadcn/ui, next-intl, Supabase, Drizzle, Auth, tabella `profiles`.
  - Fatto quando: login e logout funzionano; la CI esegue lint, typecheck e il controllo di drift dello schema. *(Chiusa.)*
  - **Modifica successiva — accesso ospite e codice email:** sessione anonima con Turnstile, codice a 6 cifre come accesso principale, conversione da ospite ad account con lo stesso user id, Google nascosto nei browser interni, limiti RLS per gli ospiti, cron di pulizia a 30 giorni. Fatto quando: il test e2e ospite → itinerario → registrazione con codice conferma che l'itinerario resta suo; test pgTAP per ogni restrizione degli ospiti; test unitari sul rilevamento dei browser interni.
    - Note di implementazione: la sessione ospite parte da "Continua senza account" nella pagina di accesso (le azioni del builder la avvieranno dalla M5); Supabase con `enable_confirmations` attivo, altrimenti `updateUser` di un ospite salverebbe l'email senza verificare il codice; il codice è anche nell'oggetto dell'email; Supabase risponde `otp_expired` sia al codice sbagliato sia a quello scaduto, quindi l'interfaccia ha un solo messaggio; un ospite con l'email di un account esistente riceve un errore e resta ospite (i suoi dati non si uniscono a quell'account); cron `/api/cron/cleanup-guests` ogni notte, con `CRON_SECRET`.
- **M2 — Schema e sicurezza.** Tutte le tabelle, enum, indici, funzioni `SECURITY DEFINER`, policy RLS e trigger di immutabilità, in PR 2a-2d; lo **schema 2e** aggiunge consigli locali (`local_tip_authors`, `local_tips`, `public_local_tips`), prenotazioni dell'itinerario (`itinerary_bookings`), `public_reviews.rewarded` e le offerte dei partner (`activity_offers`, vedi lo schema del catalogo): da `activities` escono `partner`, `partner_product_id` e `affiliate_url`, `price_from_eur` diventa `on_site_price_eur`, `/api/go` punta a un'offerta e `affiliate_clicks` riceve `offer_id`. Admin delle offerte per attività; RLS e pgTAP come le altre tabelle del catalogo. Le offerte entrano prima della M6. Lo schema 2e si fa in PR verticali (schema, RLS, logica, interfaccia, test): prima le offerte (fatta), poi i consigli locali con `LocalTip` nelle pagine (fatta: scheda attività, accanto alla tappa dell'itinerario, fascia "La voce locale" in home; coda admin "Da riverificare"). Rimandati con la loro feature: `itinerary_bookings` con il builder (M5), `public_reviews.rewarded` con le recensioni (M9).
  - Fatto quando: migrazioni applicate da zero senza errori; la suite SQL dimostra per ogni tabella che un utente non accede ai dati di un altro.
- **DS — Design system** (tra la milestone 2 e la 3). Variabili CSS generate da `docs/design/tokens.json` con uno script (tema chiaro in `:root`, scuro in `[data-theme="dark"]` e `prefers-color-scheme`; alias `"{nome}"` → `var(--nome)`), usate anche da Tailwind. Font con `next/font/google`: Fraunces (assi `opsz` e `SOFT`, peso 600) e Instrument Sans. Componenti React dai README in `docs/design/components/`, con `riferimento.css` come riferimento: Button, InterestChip, PreferenceScale, ActivityCard, ItineraryStop, DayTabs, VoteButton, BookingList, LocalTip, AffiliateOffer, Rewards, ProductCard, TabBar. Pagina `/dev/design`, visibile solo in sviluppo, con tutti i componenti nei due temi.
  - Fatto quando: lo script è deterministico (test); un controllo in CI fallisce se trova colori esadecimali o nomi di font scritti a mano in `src/`; i contrasti dichiarati nel manuale sono verificati da un test sui valori dei token.
- **M3 — Catalogo.** Pagine pubbliche di luoghi, attività e itinerari costruite con i componenti del design system; la scheda attività mostra i consigli di `public_local_tips` con `LocalTip`; admin del catalogo; seed di prova con slug `demo-`, mai in produzione.
  - Fatto quando: le pagine sono renderizzate lato server con metadati SEO; un'attività senza tag non può essere attivata.
  - Anticipato dalla M6: `/api/go/[id]` minimo (click registrato con `record_affiliate_click`, subid univoco, cookie `anon_id`, nessun URL arbitrario), così offerta affiliata e barra di prenotazione mobile funzionano.
  - Titoli dei giorni degli itinerari (`itineraries.day_titles`), scritti dall'admin; un giorno senza titolo mostra i luoghi delle sue tappe.
  - **Lista attività con filtri:** per interesse (`InterestChip`, basta uno dei selezionati) e per provincia, con lo stato nell'URL (`?interessi=sea,food_wine&provincia=TP`) e la lista renderizzata lato server; il canonical resta la lista completa. Stato vuoto con "Togli i filtri".
  - **Offerte affiliate non in pagina fino allo schema 2e** (poi tornate con `activity_offers`): il prezzo dell'attività è quello pagato in loco (ingresso, biglietto), un metadato e mai un'offerta.
  - **Azioni in sospeso:** le azioni dei mockup che dipendono da milestone successive ("Crea il tuo viaggio" M4; "Aggiungi al viaggio", Salva, "Usa questo itinerario", Viaggi nella barra mobile M5; Shop M10) sono visibili ma disabilitate (quelle che non devono comparire, come i punti della M9 e le offerte dello schema 2e, sono solo un segnaposto nascosto), marcate con `data-pending` e `data-pending-id` ed elencate in `src/lib/pending-actions.ts`. Un test e2e confronta le azioni nelle pagine con l'elenco; ogni milestone che ne implementa una la toglie. "Disponibile a breve" compare solo in sviluppo. Prima del lancio l'elenco deve essere vuoto: lo verifica il test con `PRE_LAUNCH=1` sulla build di produzione.
- **M4 — Profilo e personalizzazione.** Onboarding, pagina preferenze, filtro, scoring, algoritmo greedy. Nello scoring di gruppo i motivi "Per il gruppo" sono solo aggregati, e con meno di 3 membri solo logistici.
  - **Parte 1 (fatta):** onboarding in 6 domande anche da ospite (giorni e mesi del viaggio in `user_constraints.trip_days` e `trip_months`, ritmo e compagnia in `profiles`, budget e auto in `user_constraints`, pesi espliciti in `preference_weights`); motore in `server/personalization/` (filtro, punteggio con similarità 0 fino alla M11, greedy per zona base, motivi "Per te" che non ripetono l'input); "Ecco tre viaggi" calcolati a ogni visita, non ancora salvati come itinerari (M5). Fuori dalle 6 domande e rimandati alla pagina Preferenze: mobilità ridotta, dieta, minuti massimi di spostamento, tolleranza a caldo e folla. Le attività che richiedono l'auto sono escluse senza auto: la proposta di noleggio arriva con i partner di noleggio (M6).
  - **Parte 2 (fatta):** onboarding in 7 domande, ognuna con il suo indirizzo (`/viaggio/nuovo?domanda=N`), risposte conservate nel browser fino all'invio. Domande: 1 giorni e mesi, 2 interessi, 3 quanto conta ognuno (selezione separata dai pesi: un interesse scelto parte da 3 e può valere 0, "Non conta"), 4 ritmo, 5 con chi, 6 "Dove atterri?" (Catania, Palermo, Trapani, Comiso, Non lo so ancora), 7 budget e auto ("Ho l'auto", "La noleggio", "Niente auto").
    - **Valori neutri di "Salta"** (una domanda saltata non restringe mai il risultato): giorni 3, qualunque mese; nessun interesse; pesi a 3 per gli interessi scelti; ritmo equilibrato; compagnia non indicata; nessun aeroporto (nessun effetto sulla zona); nessun limite di budget; auto non indicata (le attività in auto restano e il viaggio dice che serve un'auto). Se non c'è nessun interesse con peso, la pagina dei tre viaggi dice "Non ci hai detto molto: ecco tre viaggi per cominciare" e non mostra "Per te".
    - **Auto:** con "Ho l'auto" o "La noleggio" le attività che richiedono l'auto sono ammesse; con "La noleggio" il viaggio segnala che serve un'auto a noleggio (link al partner con la M6); con "Niente auto" sono escluse.
    - **Aeroporto** (`user_constraints.arrival_airport`): bonus alle zone vicine nella scelta della zona base; servirà a voli e noleggi nella M6.
    - **Preferenze** (`/preferenze`): tutte le risposte, più tolleranza a caldo e folla, mobilità ridotta e dieta. Mobilità e dieta sono dati sensibili: si salvano solo con il consenso esplicito (`sensitive_consent_at`, imposto da un vincolo del database) e si cancellano dalla stessa pagina. Nello scoring sono vincoli rigidi: mobilità ridotta → solo attività accessibili; dieta → le attività di cibo e vino devono essere adatte a tutte le diete indicate (`activities.diet_friendly`, compilato dall'admin; indicativo, non una garanzia: vedi parte 3). Tolleranze salvate, non ancora usate dallo scoring.
    - **Motivi "Per te"**: interesse combinato, il migliore per un interesse, l'interesse più forte dell'utente, voto alto, ingresso libero, dieta, accessibilità, stagione, visita breve, stesso posto della tappa prima; il ripiego "Tra le più vicine ai tuoi gusti in questa zona" resta sotto un terzo delle tappe (test).
  - **Parte 3, proposte per aree** (decisa il 6 ottobre 2026; criteri completi in `docs/coda-lavori.md`): le zone diventano **aree di viaggio** (tabella `areas`, `places.area_id`), non province. Otto aree: Palermo e dintorni, Costa nord e Madonie, Ovest, Agrigentino, Interno, Etna e costa ionica, Siracusano, Barocco ibleo.
    1. **Punteggio d'area = media** dei punteggi dei giorni migliori composti in quell'area (tanti giorni quanti scelti), **non somma**: un'area non vince perché ha più attività nel catalogo.
    2. **Soglia di idoneità** (in configurazione): un'area è idonea solo se ha attività sufficienti per i giorni scelti al ritmo scelto; un'area sotto la soglia non viene mai proposta. Con almeno 3 aree idonee le tre proposte sono in tre aree diverse; altrimenti varianti della stessa area con interesse principale diverso, e il motivo lo dice ("Pochi viaggi in più zone per i giorni scelti").
    3. **Aeroporto:** piccolo bonus di vicinanza che rompe la parità tra aree simili, non ribalta la classifica; con "Non lo so ancora" nessun effetto.
    4. **Seed demo:** almeno 6 aree con almeno 6 attività ciascuna, prefisso `demo-` e descrizioni `[DEMO]`.
    5. **Dieta come preferenza, non garanzia:** il filtro per dieta resta, ma è un'indicazione dell'admin e non una garanzia del fornitore. Sotto le attività filtrate per dieta compare "Indicativo: conferma sempre con chi organizza"; nell'admin il campo delle diete adatte dice "da confermare con il fornitore".
    6. **Link "Preferenze"** nel menu utente e nella schermata "Ecco tre viaggi".
    - Ogni proposta dice perché quell'area, con motivi veri e mai generici. Admin "Copertura del catalogo": per area, attività attive, con tag, con offerta, con consiglio locale, idoneità per 3, 5 e 7 giorni.
    - **Fuori scope:** distanze tra le tappe, viaggi su due aree, isole minori.
  - **Parte 5, gusti e viaggio separati** (decisa il 6 ottobre 2026): elimina la ridondanza tra Preferenze e "Crea il tuo viaggio". Nessuna migrazione: cambiano le pagine e le azioni, non le tabelle.
    - **Gusti** (valgono per tutti i viaggi): interessi e pesi (`preference_weights`), ritmo (`profiles.pace`), tolleranze, mobilità e dieta (`user_constraints`, con consenso). Si modificano solo in Preferenze, che non ha campi del viaggio; senza gusti salvati mostra una frase e "Crea il tuo viaggio".
    - **Viaggio** (di questa volta): giorni e mesi, con chi (`profiles.party`), aeroporto, budget e auto (`user_constraints`). Restano salvati come ultimi valori usati.
    - **"Crea il tuo viaggio":** senza gusti completati (`profiles.onboarding_completed_at`, impostato alla fine del percorso) il percorso di 7 domande; con i gusti completati una sola schermata "Il tuo prossimo viaggio", precompilata, con il riepilogo dei gusti e "Modifica i gusti". Il tasto Indietro del browser porta sempre alla schermata singola, mai a una domanda del percorso già concluso.
    - **"Ecco tre viaggi":** "Cambia il viaggio" (schermata singola) e "Modifica i tuoi gusti" (Preferenze) al posto di "Cambia preferenze".
    - **Gruppi** (M8): lo scoring di gruppo aggrega solo i gusti dei membri; date e persone sono del viaggio del gruppo.
  - **Viaggi più lunghi di una sola area** (decisa il 6 ottobre 2026): se nessuna area è idonea per i giorni scelti, niente pagina vuota. La pagina mostra i tre migliori viaggi sul massimo di giorni che le aree idonee coprono, con il testo "Una sola zona copre al massimo N giorni: ecco i tre migliori viaggi di N giorni. I viaggi su più zone arrivano presto." I motivi "Per te" restano quelli delle tappe proposte.
    - **Un solo interesse forte** (peso 4 o più, tutti gli altri 2 o meno): per quell'interesse il limite di tappe dello stesso interesse al giorno sale da 2 a 3 (`SINGLE_INTEREST` in configurazione). Il ripiego "Tra le più vicine ai tuoi gusti" resta sotto un terzo delle tappe anche per questi profili (test).
    - Seed demo: almeno 2 aree coprono 5 giorni (Costa nord e Madonie, Interno).
  - **Parte 4, viaggi su due aree adiacenti** (da fare dopo la M6): una matrice dei tempi di guida tra gli hub delle 8 aree (28 coppie), compilabile dall'admin con i valori forniti da Ludovico; un viaggio composto da due aree adiacenti, con i giorni ripartiti tra le due e un trasferimento tra loro; nessuna composizione oltre una soglia di tempo di guida (in configurazione).
  - Fatto quando: test Vitest con profili e cataloghi fissi producono sempre lo stesso itinerario; nessun itinerario viola un vincolo rigido.
- **M5 — Itinerary builder.** Creazione, copia da predefinito, modifica giorno per giorno con drag and drop, salvataggio, checklist "Da prenotare" su `itinerary_bookings`. Chi crea il proprio itinerario da uno pronto eredita i titoli dei giorni (`day_titles`); se poi modifica le tappe di un giorno, il titolo resta finché non lo cambia lui, e il ripiego sui luoghi vale solo per i giorni senza titolo.
  - Fatto quando: un utente non può aprire o modificare l'itinerario di un altro (test e2e); l'e2e dell'ospite della modifica alla M1 è esteso al flusso completo dall'interfaccia: "Usa questo itinerario" come ospite, poi registrazione con codice, poi l'itinerario è ancora suo (oggi l'itinerario dell'ospite lo prepara il test nel database).
  - **Prima fetta (6 ottobre 2026; criteri in `docs/coda-lavori.md`):**
    - `/viaggio/salva`: date e persone (`itineraries.travelers`, 1-30), con Turnstile per chi non ha ancora una sessione. Ci arrivano "Usa questo itinerario" (`?da=<slug>`, eredita i titoli dei giorni) e "Salva questo viaggio" (`?area=…&variante=…`, la proposta si ricalcola sul server).
    - `/viaggi` e `/viaggi/[id]`: DayTabs, linea del percorso, riordino con su e giù (anche su desktop: il trascinamento è rimandato), rimozione, checklist "Da prenotare".
    - `/viaggi/aggiungi?attivita=<slug>` da "Aggiungi al viaggio": scelta del viaggio e del giorno, con il giorno compatibile per area proposto e l'avviso se il viaggio è in un'altra zona.
    - **Checklist:** alloggio e voli sempre, l'auto se una tappa la richiede, le attività con un'offerta attiva. `itinerary_bookings` conserva solo lo stato segnato dall'utente (riga creata alla prima spunta); `updated_by` e `updated_at` li scrive un trigger. I link ai partner sono in sospeso (`booking.partner-link`, M6).
    - **Eventi:** `user_events` registra `add_to_itinerary` e `remove_from_itinerary`, in sola scrittura.
- **M6 — Affiliati e voli.** Import del catalogo: crea e aggiorna offerte (`activity_offers`, dallo schema 2e), e crea un'attività (inattiva, da rivedere) solo se il prodotto non corrisponde a nessuna attività esistente; coda di approvazione, `/api/go/[id]` (la versione minima è in M3: restano rate limit, verifica dei parametri del subid con i termini di ogni partner e contesto dal chatbot), ricerca voli, `/api/go/flight`.
  - Fatto quando: ogni click crea una riga con subid univoco; un test dimostra che nessuna route redirige verso un URL arbitrario.
- **M7 — Chatbot.** `/api/chat`, strumenti, system prompt, interfaccia con schede attività e conferme. Nei viaggi di gruppo solo motivi aggregati; nessuno strumento restituisce le preferenze di un altro membro.
  - Fatto quando: su un set di 20 richieste di prova, ogni `[[activity:id]]` nelle risposte corrisponde a un id restituito da uno strumento nella stessa sessione (controllo automatico).
- **M8 — Gruppi.** Creazione, inviti, accettazione, voti, realtime, uscita.
  - Fatto quando: un ex membro perde l'accesso immediatamente (test RLS); due sessioni aperte vedono le modifiche dell'altra entro 2 secondi.
- **M9 — Gamification.** `award_points`, badge, leaderboard di gruppo e stagionale, `record_check_in`, `submit_review`.
  - Fatto quando: la stessa azione inviata due volte accredita i punti una volta sola; la vista della classifica non espone lo storico.
- **M10 — Shop.** Catalogo prodotti, carrello, Stripe Checkout, webhook, spedizioni del produttore, rimborsi, uso dei punti.
  - Fatto quando: flusso completo in modalità test di Stripe; lo stesso webhook ricevuto due volte crea un solo ordine.
- **M11 — Apprendimento e analisi.** Cron dei pesi impliciti e degli embedding del profilo, import conversioni, dashboard admin.
  - Fatto quando: dopo una serie di eventi di prova i pesi cambiano nella direzione attesa e restano tra -2 e +2.
- **M12 — Rifinitura.** PWA, performance, pagine legali, cookie banner, analytics, pagine di errore; le voci di M12 in `docs/design/BACKLOG.md` (Fraunces come istanza fissa, `text-wrap: balance`).
  - Fatto quando: Lighthouse mobile sopra 90 su home, attività e prodotto; nessun cookie non tecnico prima del consenso.

**Ordine di lavoro dopo la milestone 2** (deciso il 28 settembre 2026, poi aggiornato lo stesso giorno): 1) DS — Design system (fatta); 2) M3 — Catalogo con i componenti del design system; 3) modifica alla M1, accesso ospite e codice email; 4) schema 2e; poi M4 e successive nell'ordine dell'elenco. La 3a (regola dei tag, seed demo, prime pagine pubbliche) è già in `main`: la M3 rifà quelle pagine con i componenti del design system.

Il lavoro di design e contenuti rimandato (schermate da progettare, voci del design system, contenuti a carico di Ludovico, decisioni aperte) è tracciato in `docs/design/BACKLOG.md`.

## Vincoli esterni e rischi

I blocchi veri non sono tecnici: accessi ai partner, accordi con i produttori e obblighi legali richiedono settimane e vanno avviati mentre Antigravity lavora sulle prime milestone. I punti legali e fiscali qui sotto sono da confermare con commercialista e consulente, non sono pareri.

| Area | Vincolo o rischio | Azione |
| --- | --- | --- |
| Partner attività | GetYourGuide e Viator approvano l'accesso API caso per caso, a volte con traffico minimo | Registrarsi subito a Travelpayouts e ai programmi diretti; fino all'approvazione usare link affiliati semplici e attività curate |
| Termini dei partner | Ogni programma ha regole su cache dei prezzi, uso del marchio, pubblicità a pagamento sul brand del partner | Leggere i termini prima della milestone 6 e configurare la cache di conseguenza |
| Produttori | Senza accordo scritto un ritardo o un errore di spedizione ricade sul brand | Accordo con prezzi, tempi di spedizione, imballaggio, gestione di resi e reclami; 2-3 produttori testati con ordini reali |
| Vendita di alimenti | Chi vende a proprio nome ha obblighi come operatore alimentare; online le informazioni obbligatorie, allergeni compresi, vanno mostrate prima dell'acquisto (Reg. UE 1169/2011) | Decidere se vendere a proprio nome o come intermediario; verificare registrazioni sanitarie necessarie |
| Fiscale | Partita IVA e codice ATECO devono coprire commercio elettronico e provvigioni; oltre 10.000 euro annui di vendite a privati in altri paesi UE si applica l'IVA del paese di destinazione (regime OSS) | Telefonata al commercialista prima della prima vendita |
| Diritti dei consumatori | Recesso di 14 giorni, con esclusioni per beni deperibili | Condizioni di vendita scritte in base al tipo di prodotto |
| Privacy | Profilazione, posizione per i check-in, dati inviati a fornitori extra UE | Informativa chiara, consenso esplicito per profilazione e posizione, regione UE su Supabase, accordi sul trattamento dati con i fornitori |
| Trasparenza | I link affiliati vanno dichiarati come tali | Avviso nelle pagine e nelle schede attività |
| Costi AI | Il chatbot costa a ogni messaggio anche se l'utente non genera commissioni | Limite giornaliero e misura del costo per utente dalla prima settimana |
| Traffico | Una piattaforma completa senza utenti non genera nulla | Pubblicare le pagine degli itinerari e delle attività appena pronte (milestone 3) e produrre contenuti video in parallelo allo sviluppo |
