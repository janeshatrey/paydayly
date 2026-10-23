#!/usr/bin/env bash
# Render start step: restore the SQLite database from Backblaze B2 if the disk is empty,
# then run the server under Litestream so every write is replicated.
set -euo pipefail

DATA_DIR="${PAYDAYLY_DATA_DIR:-/tmp/data}"
export PAYDAYLY_DATA_DIR="$DATA_DIR"
mkdir -p "$DATA_DIR"

for variable in LITESTREAM_ACCESS_KEY_ID LITESTREAM_SECRET_ACCESS_KEY B2_BUCKET B2_ENDPOINT B2_REGION; do
  if [ -z "${!variable:-}" ]; then
    echo "ERROR: $variable is required. Refusing to start with an unprotected ephemeral database."
    exit 1
  fi
done

./bin/litestream restore -config litestream.yml -if-db-not-exists -if-replica-exists "$DATA_DIR/paydayly.db"
exec ./bin/litestream replicate -config litestream.yml -exec "npm start"
