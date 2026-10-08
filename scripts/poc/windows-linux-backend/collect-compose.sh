#!/usr/bin/env bash
set -euo pipefail
windows_output=$1
export APPLICATION_SHA=79a976cd8765367ea4f04baa00905822681cf294
if [ -f /opt/outliner-app/docker-compose.yml ]; then
  cd /opt/outliner-app
  compose=(docker compose -f docker-compose.yml -f /opt/outliner-harness/scripts/poc/windows-linux-backend/compose.linux.yml)
  "${compose[@]}" ps --all > /opt/outliner-evidence/compose-ps.txt 2>&1 || true
  "${compose[@]}" logs --no-color > /opt/outliner-evidence/compose-logs.txt 2>&1 || true
  "${compose[@]}" down > /opt/outliner-evidence/compose-down.txt 2>&1 || true
fi
if [ -d /opt/outliner-evidence ]; then cp -a /opt/outliner-evidence/. "$windows_output/"; fi
