@AGENTS.md

# Sicilia Planner

Planner di viaggi in Sicilia con link affiliati + shop di prodotti spediti dai produttori.
La specifica completa è in [docs/spec.md](docs/spec.md): leggerla prima di iniziare una milestone.

## Comandi

- `npm run db:start` — Supabase locale (porte 553xx; le 543xx sono di Segretaria AI)
- `npm run dev` — app su http://localhost:3000
- `npm run lint`, `npm run typecheck`, `npm test` (Vitest), `npx playwright test` (e2e)
- `npm run db:generate` — migrazione dallo schema Drizzle; `-- --custom --name=x` per SQL a mano (RLS, funzioni, trigger)
- `npm run db:reset` — riapplica tutte le migrazioni da zero
- `npm run db:test` — test RLS in pgTAP (`supabase/tests/*.test.sql`)
- `npm run db:snapshot` — aggiorna `supabase/schema.sql` dopo ogni migrazione
- `npm run db:drift` — lo stesso controllo della CI

## Regole

- Next.js 16: il middleware si chiama `proxy` (`src/proxy.ts`). Consultare `node_modules/next/dist/docs/` prima di usare API di Next.
- `app/` chiama solo funzioni di `src/server/`, mai il database direttamente. I file in `src/server/` importano `server-only`.
- Ogni mutazione: validazione Zod → `requireUser`/`requireAdmin` → scrittura. La RLS è la seconda difesa.
- `db` (Drizzle, `src/server/db/client.ts`) bypassa la RLS: usarlo solo dopo il controllo dell'utente, o in cron e webhook. Per le letture per conto dell'utente usare il client Supabase di `src/server/supabase/server.ts`.
- Ogni tabella nuova: RLS attiva nella stessa migrazione + test pgTAP che dimostri che un utente non vede né modifica i dati di un altro.
- Migrazioni in `supabase/migrations/` (generate da drizzle-kit con prefisso timestamp). Non modificare migrazioni già committate su `main`.
- Testi dell'interfaccia solo in `messages/it.json` e `messages/en.json`.
- Redirect verso percorsi ricevuti in input solo tramite `safeNextPath`.
- Una milestone = un branch `milestone/NN-nome`; chiusa solo con i criteri di docs/spec.md verificati e la CI verde.
