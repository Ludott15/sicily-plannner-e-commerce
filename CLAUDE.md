@AGENTS.md

# Sicilia Planner

Planner di viaggi in Sicilia con link affiliati + shop di prodotti spediti dai produttori.
La specifica completa è in [docs/spec.md](docs/spec.md): leggerla prima di iniziare una milestone.
Design system, manuale del brand ("Isula", nome di lavoro), schemi e mockup: [docs/design/README.md](docs/design/README.md). Manuale, schemi e README dei componenti sono vincolanti: niente colori o font scritti a mano (solo token), niente parole vietate del manuale nei testi, mai contenuti o autori inventati (i testi tra parentesi quadre nei mockup vengono dal database).

## Modo di lavoro (priorità: velocità senza fretta)

- Una PR = una feature completa in verticale (migrazione, RLS, logica, UI, test), non uno strato.
- Rigore pieno solo su: RLS e migrazioni, autenticazione e ospiti, pagamenti e webhook Stripe, redirect e tracciamento affiliati, cancellazione dati, workflow CI. Qui valgono prova a rovescio e conteggi dai log.
- Altrove (pagine, componenti, testi, stili, admin interno): CI verde, test solo per la logica pura, nessun confronto screenshot, nessuna prova a rovescio.
- Decisioni: se reversibili (nomi, layout, dettagli di UI, struttura interna del codice) decidi tu e annota una riga nella PR. Chiedi solo se irreversibili (schema in produzione, soldi, testi legali, dati degli utenti, scelta di fornitori).
- Se la PR è verde e non tocca i percorsi sensibili, scrivi "pronta al merge" e passa al lavoro successivo della milestone su un nuovo branch (da quello della PR non unita, se ne dipende, dicendolo).
- Riepilogo PR: massimo 10 righe: cosa fa, cosa non fa, scostamenti, conteggi solo per le suite toccate.
- Restano valide le regole su git (mai push su main, mai merge) e sui token del design system.
- Configurazione di produzione e controlli di lancio: [docs/LANCIO.md](docs/LANCIO.md).
- Mai `supabase config push` direttamente: `npm run supabase:push-production` (controlla `[remotes.production]` e le variabili `env()`). Il blocco di produzione in `supabase/config.toml` non contiene valori locali né segreti: lo verifica `scripts/supabase/production-config.test.ts` in CI.

## Comandi

- `npm run db:start` — Supabase locale (porte 553xx; le 543xx sono di Segretaria AI)
- `npm run dev` — app su http://localhost:3000
- `npm run lint`, `npm run typecheck`, `npm test` (Vitest unit), `npm run test:int` (Vitest su Postgres locale, file `*.int.test.ts`), `npx playwright test` (e2e)
- `npm run db:generate` — migrazione dallo schema Drizzle; `-- --custom --name=x` per SQL a mano (RLS, funzioni, trigger)
- `npm run db:reset` — riporta il database locale allo stato del seed: migrazioni da zero più `supabase/seed.sql`
- `npm run db:clean` — elimina solo i dati lasciati dai test (slug e titoli `int-`/`e2e-`, utenti `int-…@example.com` ed `e2e-…@example.com`); gira anche prima e dopo le suite di integrazione ed e2e
- `npm run db:test` — test RLS in pgTAP (`supabase/tests/*.test.sql`); gli helper (`tests.create_user`, `tests.authenticate_as`, `tests.as_anon`) si includono con `\ir helpers/setup.psql` dopo `begin;`
- `npm run db:snapshot` — aggiorna `supabase/schema.sql` dopo ogni migrazione
- `npm run media:demo` — immagini demo nello storage locale (dopo `db:reset`: il seed non carica file); regole delle immagini in [docs/IMMAGINI.md](docs/IMMAGINI.md)
- `npm run db:drift` — lo stesso controllo della CI

## Design system

- Fonte unica: `docs/design/tokens.json`. `npm run design:tokens` rigenera `generated/design/` (`tokens.css` con le variabili nei due temi, `theme.css` per Tailwind, `fonts.ts` con `next/font/google`); i file generati si committano e non si modificano a mano.
- `npm run design:check` (anche in CI): file generati aggiornati e nessun colore (esadecimale, `rgb()`, `oklch()`, nomi di colore, tavolozze Tailwind) o nome di font scritto a mano in `src/`. I commenti sono esclusi.
- Tailwind usa solo i token: `bg-calce`, `text-lava-muted`, `border-divider`, `text-display-l`, `rounded-lg`, `shadow-card`… Le tavolozze predefinite sono azzerate.
- Componenti in `src/components/design/` (import da `@/components/design`), stili in `src/components/design/isula.css`, porting di `docs/design/components/riferimento.css`. Regole di ogni componente nel suo README: se una regola non si può rispettare, fermarsi e chiedere, non adattare.
- Fraunces: `font-optical-sizing: auto`; in `font-variation-settings` solo `"SOFT" 50`, mai `opsz`.
- Catalogo dei componenti nei due temi: `/it/dev/design`, solo in sviluppo. Screenshot: con `npm run dev` avviato, `node scripts/design/screenshots.mjs`.
- Tema: segue il sistema; `data-theme="light"` o `"dark"` su un elemento lo forza per quel sottoalbero.
- `isula.css` sta nel layer `components` di Tailwind: una classe di utilità sullo stesso elemento (`w-full`, `aspect-[4/3]`…) vince sulle regole del componente.
- Pagine confrontate con i mockup: con `npm run dev` avviato, `node scripts/design/compare-mockups.mjs` scrive in `docs/design/screenshots/m3/` le coppie mockup/pagina (1280 e 390, tema chiaro) e la pagina in tema scuro alle due larghezze.
- Azioni dei mockup che dipendono da milestone future: visibili ma disabilitate con `PendingButton` (o `pendingAttributes`), elencate in `src/lib/pending-actions.ts`. Implementando un'azione la si toglie dall'elenco: l'e2e `pending-actions.spec.ts` confronta pagine ed elenco. Prima del lancio l'elenco è vuoto (`PRE_LAUNCH=1`).
- Nelle pagine non compaiono mai i segnaposto tra parentesi quadre dei mockup: se un dato manca, la sezione non c'è o mostra lo stato vuoto di `schemi.md` (lo verifica l'e2e del catalogo).

## Regole

- Next.js 16: il middleware si chiama `proxy` (`src/proxy.ts`). Consultare `node_modules/next/dist/docs/` prima di usare API di Next.
- `app/` chiama solo funzioni di `src/server/`, mai il database direttamente. I file in `src/server/` importano `server-only`.
- Ogni mutazione: validazione Zod → `requireUser`/`requireAdmin` → scrittura. La RLS è la seconda difesa.
- Accesso ai dati solo con Drizzle, tramite due client:
  - `dbAsUser(user, (tx) => ...)` da `@/server/db/user`: transazione con `set local role authenticated` e `request.jwt.claims` dell'utente, quindi la RLS si applica. È il default. `user` deve arrivare da `getUser`/`requireUser`, mai da input del client.
  - `dbPublic((tx) => ...)` da `@/server/db/public`: ruolo `anon`, per le pagine pubbliche e i visitatori senza account (vede solo ciò che la RLS concede agli anonimi).
  - `dbAdmin` da `@/server/db/admin`: ruolo `postgres`, bypassa la RLS. Consentito solo in `src/app/api/cron/**`, `src/app/api/stripe/**`, `src/app/[locale]/(admin)/**` e nei file `src/server/**/*.admin.ts` (funzioni server riservate), più i test `*.int.test.ts`. Lo impone `no-restricted-imports` in `eslint.config.mjs`: non disattivare la regola, spostare il codice in un file `.admin.ts`.
  - `src/server/db/connection.ts`, `postgres` e `drizzle-orm/postgres-js` non si importano fuori da `src/server/db`.
  - I file `*.admin.ts` non si importano da `(app)`, `(public)`, `components`, `lib` né da file server non `.admin.ts` (ESLint). Un'azione utente che tocca dati riservati usa una funzione SQL `SECURITY DEFINER` (con `set search_path = public, pg_temp`) chiamata tramite `dbAsUser`, non un modulo `.admin.ts`.
  - Prepared statement disattivati di default (`DATABASE_PREPARED_STATEMENTS`, default `false`): in produzione `DATABASE_URL` punta al pooler Supabase in modalità transaction (porta 6543), che non li supporta. Metterla a `true` solo con connessione diretta o session mode.
- Punti solo con `public.award_points(...)` (eseguibile da server e funzioni SECURITY DEFINER, mai dal client), con un `ref_id` che identifichi l'azione: la stessa (utente, motivo, ref_id) accredita una volta sola. `points_ledger` e `user_badges` sono immutabili (trigger `prevent_mutation`); le correzioni sono nuove righe (`admin_adjust`, `redeem_refund`).
- Dati da conservare oltre l'account: `orders` (obblighi fiscali) e `admin_audit_log` usano `on delete set null` sull'utente, mai cascade. `admin_audit_log` è immutabile come il ledger (trigger `admin_audit_log_immutable`): ogni azione admin su punti, ordini o stato delle attività aggiunge una riga dal codice server.
- Il client Supabase serve solo per auth e realtime: niente `supabase.from()` o `supabase.rpc()` (bloccati da ESLint).
- Ospiti (sessione anonima di Supabase): `user.is_anonymous`. `dbAsUser` passa `is_anonymous` nei claim; le restrizioni nelle policy e nelle funzioni SQL usano `not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false)` (errore di dominio `guest_not_allowed`), e `award_points` guarda `auth.users.is_anonymous`. Ogni nuova azione vietata agli ospiti ha il suo test pgTAP (`tests.create_guest` negli helper).
- Turnstile: in locale e in CI chiavi di prova di Cloudflare (site key di default in `src/lib/env.ts`, segreto in `supabase/config.toml`); serve la rete verso challenges.cloudflare.com. Template delle email in `supabase/templates/` (in produzione vanno copiati nella dashboard).
- Cron in `src/app/api/cron/**`, pianificati in `vercel.json`, autorizzati con `isAuthorizedCron` (`Authorization: Bearer CRON_SECRET`).
- Sul server l'utente si verifica con `supabase.auth.getUser()` (tramite `getUser`/`requireUser`) o `getClaims()`; mai `getSession()`, che legge il cookie senza verificarlo (bloccato da ESLint).
- Ogni tabella nuova: RLS attiva nella stessa migrazione, prima `revoke all ... from anon, authenticated` e poi grant minimi per colonna. Test pgTAP con almeno anonimo, proprietario, altro utente e admin; per le tabelle di gruppo anche membro ed ex membro. I test non devono dipendere dai dati già presenti nel database locale. Le policy devono funzionare sia per il client Supabase sia per `dbAsUser` (si basano su `auth.uid()`).
- Funzioni SQL con errori di dominio: `raise exception '<codice_snake_case>' using errcode = 'P0001'` (es. `invite_expired`); mancata autenticazione con `42501`. L'app mappa il messaggio, i test lo verificano con `throws_ok(..., 'P0001', '<codice>')`.
- Nelle policy RLS scrivere `(select auth.uid())` e `(select public.is_admin())`, mai `auth.uid()` diretto: con la subquery Postgres la valuta una volta per query invece che per ogni riga.
- Migrazioni in `supabase/migrations/` (generate da drizzle-kit con prefisso timestamp). Non modificare migrazioni già committate su `main`.
- Testi dell'interfaccia solo in `messages/it.json` e `messages/en.json`.
- Form con azione server che può restituire un errore: l'azione parte da `onSubmit` con `startTransition` (vedi `src/components/admin/use-admin-form.ts`), non da `<form action>`, perché React 19 azzera i campi dopo l'azione e l'utente perderebbe quello che ha scritto.
- Redirect verso percorsi ricevuti in input solo tramite `safeNextPath`.
- Una milestone = un branch `milestone/NN-nome`; chiusa solo con i criteri di docs/spec.md verificati e la CI verde.

## Seed

- `supabase/seed.sql` contiene **solo dati demo** per sviluppo locale, CI ed e2e: slug con prefisso `demo-` e intestazione del file come marcatore (i testi non portano più `[DEMO]`). I testi di luoghi, attività, itinerari e consigli sono quelli di `content/catalog/`: `scripts/content/catalog-seed.test.ts` controlla che seed e catalogo non divergano. Non caricarlo mai in produzione: `supabase db push` non esegue il seed, e non si usa `--include-seed` verso il progetto di produzione. Il catalogo reale si importa con `npm run content:catalog` (senza prefisso; `--slug-prefix=demo-` solo verso un database locale) o lo inserisce Ludovico dall'admin. Il marcatore `[DEMO]` resta solo nelle immagini demo (`scripts/media/demo-images.mjs`), che il controllo di lancio continua a cercare.
- I test pgTAP e di integrazione non devono dipendere dal seed; gli e2e possono usarlo.
- Tutto ciò che un test crea fuori da una transazione annullata usa il prefisso `int-` (integrazione) o `e2e-` (Playwright), in slug, titoli ed email: `scripts/db/clean-test-data.mjs` lo elimina. Le righe di `admin_audit_log` scritte dagli e2e restano (il registro è immutabile): i test che lo leggono filtrano sui propri utenti.
- Gli e2e che devono leggere o preparare il database usano `withDb` da `e2e/db.mjs` con `await import("./db.mjs")`: Playwright compila gli spec in CommonJS e non importa staticamente un modulo ES.

## Resoconti

- Per ogni suite (unit, integrazione, pgTAP, e2e) riportare il conteggio passati/totali preso dai log della CI: `bash scripts/ci-test-counts.sh <run-id>`. "Step verde" senza numero non vale come verifica.

## Git (regola permanente)

- Mai push diretto su `main`, mai force push (`--force`, `--force-with-lease`), mai merge di PR.
- Si lavora su un branch, si fa push del branch e si apre la PR verso `main`; il merge lo fa sempre Ludovico dopo aver visto la CI.
- Ogni modifica a `.github/workflows/` va dichiarata esplicitamente nel riepilogo della PR, con il motivo.
- Mai rimuovere, saltare o indebolire step o job della CI (`continue-on-error`, `if: false`, test esclusi o saltati, soglie abbassate) senza approvazione esplicita di Ludovico.
