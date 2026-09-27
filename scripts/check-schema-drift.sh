#!/usr/bin/env bash
# Confronta lo schema prodotto dalle migrazioni con lo snapshot committato
# (supabase/schema.sql) e verifica che lo schema Drizzle non abbia modifiche
# senza migrazione. Richiede Supabase locale avviato e migrazioni applicate.
set -euo pipefail

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

npx supabase db dump --local --schema public -f "$tmp/schema.sql" >/dev/null
if ! diff -u --strip-trailing-cr supabase/schema.sql "$tmp/schema.sql"; then
  echo "::error::Schema drift: esegui 'npm run db:snapshot' e committa supabase/schema.sql" >&2
  exit 1
fi

# Confronto prima/dopo: in locale le migrazioni nuove non ancora committate non sono drift.
before="$(git status --porcelain --untracked-files=all -- supabase/migrations)"
npx drizzle-kit generate --name=drift-check >/dev/null
after="$(git status --porcelain --untracked-files=all -- supabase/migrations)"
if [ "$before" != "$after" ]; then
  diff <(echo "$before") <(echo "$after") || true
  echo "::error::Lo schema Drizzle ha modifiche senza migrazione: esegui 'npm run db:generate'" >&2
  exit 1
fi

echo "Nessun drift di schema."
