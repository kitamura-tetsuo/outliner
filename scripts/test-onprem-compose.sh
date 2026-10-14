#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
export OUTLINER_LOCAL_PASSWORD=${OUTLINER_LOCAL_PASSWORD:-compose-smoke-password}
export OUTLINER_DATA_DIR=${OUTLINER_DATA_DIR:-"$(mktemp -d)/data"}
export OUTLINER_ONPREM_PORT=${OUTLINER_ONPREM_PORT:-17070}
mkdir -p "$OUTLINER_DATA_DIR"
chmod 0777 "$OUTLINER_DATA_DIR"

cleanup() {
  docker compose -f "$ROOT/compose.onprem.yml" down --remove-orphans >/dev/null 2>&1 || true
  if [[ "$OUTLINER_DATA_DIR" == /tmp/* ]]; then rm -rf "$(dirname "$OUTLINER_DATA_DIR")"; fi
}
trap cleanup EXIT

if env -u OUTLINER_LOCAL_PASSWORD docker compose -f "$ROOT/compose.onprem.yml" config --quiet >/dev/null 2>&1; then
  echo "compose unexpectedly accepted a missing OUTLINER_LOCAL_PASSWORD" >&2
  exit 1
fi
if env -u OUTLINER_DATA_DIR docker compose -f "$ROOT/compose.onprem.yml" config --quiet >/dev/null 2>&1; then
  echo "compose unexpectedly accepted a missing OUTLINER_DATA_DIR" >&2
  exit 1
fi
docker compose -f "$ROOT/compose.onprem.yml" config --quiet
docker compose -f "$ROOT/compose.onprem.yml" build
docker compose -f "$ROOT/compose.onprem.yml" up -d --wait

cd "$ROOT/client"
npx playwright test --config playwright.compose-onprem.config.ts
