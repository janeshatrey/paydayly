#!/usr/bin/env bash
# Render build step: install deps (dev deps are needed for vite/tsc/tsx), build the client, fetch Litestream.
set -euo pipefail

npm ci --include=dev
npm rebuild better-sqlite3 esbuild
npm run build

LITESTREAM_VERSION=0.3.13
mkdir -p bin
curl -fsSL "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-amd64.tar.gz" | tar -xz -C bin litestream
./bin/litestream version
