#!/usr/bin/env bash
# Render start step: restore the SQLite database from Backblaze B2 if the disk is empty,
# then run the server under Litestream so every write is replicated.
set -euo pipefail

DATA_DIR="${PAYDAYLY_DATA_DIR:-/tmp/data}"
export PAYDAYLY_DATA_DIR="$DATA_DIR"
mkdir -p "$DATA_DIR"

if [ -z "${LITESTREAM_ACCESS_KEY_ID:-}" ] || [ -z "${B2_BUCKET:-}" ]; then
  echo "WARNING: Litestream not configured (LITESTREAM_ACCESS_KEY_ID / B2_BUCKET unset). Data will be lost on restart."
  exec npm start
fi

./bin/litestream restore -config litestream.yml -if-db-not-exists -if-replica-exists "$DATA_DIR/paydayly.db"
exec ./bin/litestream replicate -config litestream.yml -exec "npm start"
