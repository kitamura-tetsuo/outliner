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

# The production app joins only Docker's internal network, so it cannot reach
# external runtime services. The gateway has no application logic and merely
# forwards the one loopback-published TCP origin to the app.
app_networks=$(docker inspect "$(docker compose -f "$ROOT/compose.onprem.yml" ps -q app)" --format '{{json .NetworkSettings.Networks}}')
runtime_network=$(docker network inspect outliner-onprem_runtime --format '{{.Internal}}')
if [[ "$runtime_network" != "true" || "$app_networks" != *"outliner-onprem_runtime"* || "$app_networks" == *"outliner-onprem_ingress"* ]]; then
  echo "on-prem app is not isolated on the internal runtime network" >&2
  exit 1
fi

cd "$ROOT/client"
npx playwright test --config playwright.compose-onprem.config.ts
