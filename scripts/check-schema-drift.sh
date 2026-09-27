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

npx drizzle-kit generate --name=drift-check >/dev/null
if [ -n "$(git status --porcelain -- supabase/migrations)" ]; then
  git status --porcelain -- supabase/migrations
  echo "::error::Lo schema Drizzle ha modifiche senza migrazione: esegui 'npm run db:generate'" >&2
  exit 1
fi

echo "Nessun drift di schema."
