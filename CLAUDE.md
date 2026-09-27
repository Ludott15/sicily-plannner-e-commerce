@AGENTS.md

# Sicilia Planner

Planner di viaggi in Sicilia con link affiliati + shop di prodotti spediti dai produttori.
La specifica completa è in [docs/spec.md](docs/spec.md): leggerla prima di iniziare una milestone.

## Comandi

- `npm run db:start` — Supabase locale (porte 553xx; le 543xx sono di Segretaria AI)
- `npm run dev` — app su http://localhost:3000
- `npm run lint`, `npm run typecheck`, `npm test` (Vitest unit), `npm run test:int` (Vitest su Postgres locale, file `*.int.test.ts`), `npx playwright test` (e2e)
- `npm run db:generate` — migrazione dallo schema Drizzle; `-- --custom --name=x` per SQL a mano (RLS, funzioni, trigger)
- `npm run db:reset` — riapplica tutte le migrazioni da zero
- `npm run db:test` — test RLS in pgTAP (`supabase/tests/*.test.sql`)
- `npm run db:snapshot` — aggiorna `supabase/schema.sql` dopo ogni migrazione
- `npm run db:drift` — lo stesso controllo della CI

## Regole

- Next.js 16: il middleware si chiama `proxy` (`src/proxy.ts`). Consultare `node_modules/next/dist/docs/` prima di usare API di Next.
- `app/` chiama solo funzioni di `src/server/`, mai il database direttamente. I file in `src/server/` importano `server-only`.
- Ogni mutazione: validazione Zod → `requireUser`/`requireAdmin` → scrittura. La RLS è la seconda difesa.
- Accesso ai dati solo con Drizzle, tramite due client:
  - `dbAsUser(user, (tx) => ...)` da `@/server/db/user`: transazione con `set local role authenticated` e `request.jwt.claims` dell'utente, quindi la RLS si applica. È il default. `user` deve arrivare da `getUser`/`requireUser`, mai da input del client.
  - `dbAdmin` da `@/server/db/admin`: ruolo `postgres`, bypassa la RLS. Consentito solo in `src/app/api/cron/**`, `src/app/api/stripe/**`, `src/app/[locale]/(admin)/**` e nei file `src/server/**/*.admin.ts` (funzioni server riservate), più i test `*.int.test.ts`. Lo impone `no-restricted-imports` in `eslint.config.mjs`: non disattivare la regola, spostare il codice in un file `.admin.ts`.
  - `src/server/db/connection.ts`, `postgres` e `drizzle-orm/postgres-js` non si importano fuori da `src/server/db`.
  - I file `*.admin.ts` non si importano da `(app)`, `(public)`, `components`, `lib` né da file server non `.admin.ts` (ESLint). Un'azione utente che tocca dati riservati usa una funzione SQL `SECURITY DEFINER` (con `set search_path = public, pg_temp`) chiamata tramite `dbAsUser`, non un modulo `.admin.ts`.
  - Prepared statement disattivati di default (`DATABASE_PREPARED_STATEMENTS`, default `false`): in produzione `DATABASE_URL` punta al pooler Supabase in modalità transaction (porta 6543), che non li supporta. Metterla a `true` solo con connessione diretta o session mode.
- Il client Supabase serve solo per auth e realtime: niente `supabase.from()` o `supabase.rpc()` (bloccati da ESLint).
- Sul server l'utente si verifica con `supabase.auth.getUser()` (tramite `getUser`/`requireUser`) o `getClaims()`; mai `getSession()`, che legge il cookie senza verificarlo (bloccato da ESLint).
- Ogni tabella nuova: RLS attiva nella stessa migrazione + test pgTAP che dimostri che un utente non vede né modifica i dati di un altro. Le policy devono funzionare sia per il client Supabase sia per `dbAsUser` (si basano su `auth.uid()`).
- Nelle policy RLS scrivere `(select auth.uid())` e `(select public.is_admin())`, mai `auth.uid()` diretto: con la subquery Postgres la valuta una volta per query invece che per ogni riga.
- Migrazioni in `supabase/migrations/` (generate da drizzle-kit con prefisso timestamp). Non modificare migrazioni già committate su `main`.
- Testi dell'interfaccia solo in `messages/it.json` e `messages/en.json`.
- Redirect verso percorsi ricevuti in input solo tramite `safeNextPath`.
- Una milestone = un branch `milestone/NN-nome`; chiusa solo con i criteri di docs/spec.md verificati e la CI verde.
