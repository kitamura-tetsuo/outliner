#!/usr/bin/env bash
set -euo pipefail
app_archive=$1
harness_archive=$2
export APPLICATION_SHA=$3
mkdir -p /opt/outliner-app /opt/outliner-harness /opt/outliner-evidence
tar -xf "$app_archive" -C /opt/outliner-app
tar -xf "$harness_archive" -C /opt/outliner-harness
cd /opt/outliner-app
compose=(docker compose -f docker-compose.yml -f /opt/outliner-harness/scripts/poc/windows-linux-backend/compose.linux.yml)
"${compose[@]}" config > /opt/outliner-evidence/compose-resolved.yml
"${compose[@]}" --progress plain build yjs-server
"${compose[@]}" up -d --no-build yjs-server
"${compose[@]}" ps --all
container_id=$("${compose[@]}" ps -q yjs-server)
docker inspect --format 'Image={{.Image}} OS={{.Platform}} Source={{index .Config.Labels "org.opencontainers.image.revision"}}' "$container_id"
