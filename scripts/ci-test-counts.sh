#!/usr/bin/env bash
# Estrae dai log di una run della CI i conteggi di ogni suite di test (passati/totali).
# Uso: bash scripts/ci-test-counts.sh <run-id>   (GH=percorso di gh se non è nel PATH)
set -euo pipefail

gh="${GH:-gh}"
run_id="$1"

"$gh" run view "$run_id" --log |
  sed -E 's/(\x1b|\^\[)\[[0-9;]*m//g' |
  awk -F '\t' '
    $3 ~ /Files=[0-9]+, Tests=[0-9]+/ || $3 ~ /Result: (PASS|FAIL)/ ||
    $3 ~ /Tests +[0-9]+ (passed|failed)/ || $3 ~ /^[^ ]+Z +[0-9]+ (passed|failed|flaky|skipped) \(/ {
      sub(/^[^ ]+Z +/, "", $3)
      print $2 ": " $3
    }'
