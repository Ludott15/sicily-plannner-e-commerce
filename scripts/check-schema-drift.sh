#!/usr/bin/env bash
# Confronta lo schema prodotto dalle migrazioni con lo snapshot committato
# (supabase/schema.sql) e verifica che lo schema Drizzle non abbia modifiche
# senza migrazione. Richiede Supabase locale avviato e migrazioni applicate.
set -euo pipefail

tmp="$(mktemp -d)"

# All'uscita, anche per errore: la migrazione di prova "drift-check" e il journal modificato non
# restano mai nel repository (finirebbero in un commit per sbaglio).
cleanup() {
  for generated in supabase/migrations/*_drift-check.sql; do
    [ -e "$generated" ] || continue
    rm -f "$generated" "supabase/migrations/meta/$(basename "${generated%_drift-check.sql}")_snapshot.json"
  done
  if [ -f "$tmp/_journal.json" ]; then
    cp "$tmp/_journal.json" supabase/migrations/meta/_journal.json
  fi
  rm -rf "$tmp"
}
trap cleanup EXIT

npx supabase db dump --local --schema public -f "$tmp/schema.sql" >/dev/null
if ! diff -u --strip-trailing-cr supabase/schema.sql "$tmp/schema.sql"; then
  echo "::error::Schema drift: esegui 'npm run db:snapshot' e committa supabase/schema.sql" >&2
  exit 1
fi

# Confronto prima/dopo: in locale le migrazioni nuove non ancora committate non sono drift.
before="$(git status --porcelain --untracked-files=all -- supabase/migrations)"
cp supabase/migrations/meta/_journal.json "$tmp/_journal.json"
npx drizzle-kit generate --name=drift-check >/dev/null
after="$(git status --porcelain --untracked-files=all -- supabase/migrations)"
if [ "$before" != "$after" ]; then
  diff <(echo "$before") <(echo "$after") || true
  echo "::error::Lo schema Drizzle ha modifiche senza migrazione: esegui 'npm run db:generate'" >&2
  exit 1
fi

echo "Nessun drift di schema."
