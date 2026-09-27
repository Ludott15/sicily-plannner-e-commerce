# Sicilia Planner

Planner di viaggi in Sicilia monetizzato con link affiliati, più shop di prodotti siciliani spediti dai produttori. Specifica: [docs/spec.md](docs/spec.md).

Stack: Next.js 16 (App Router), TypeScript strict, Tailwind + shadcn/ui, next-intl (it/en), Supabase (Postgres, Auth), Drizzle ORM, Zod, Vitest, Playwright.

## Avvio in locale

Requisiti: Node 24, Docker Desktop.

```bash
npm install
npm run db:start          # Supabase locale: stampa le chiavi
cp .env.example .env.local  # e compilare con i valori di `npx supabase status`
npm run dev
```

- App: http://localhost:3000
- Supabase Studio: http://127.0.0.1:55323
- Email di test (magic link): http://127.0.0.1:55324

### Login con Google in locale

Creare un client OAuth "Web application" su Google Cloud con redirect URI
`http://127.0.0.1:55321/auth/v1/callback`, poi esportare prima di `npm run db:start`:

```bash
export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...
export SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=...
```

## Verifiche

```bash
npm run lint && npm run typecheck && npm test
npm run db:test    # RLS (pgTAP)
npm run db:drift   # schema = migrazioni = snapshot
npx playwright test
```
