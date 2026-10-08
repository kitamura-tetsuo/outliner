#!/usr/bin/env bash
set -euo pipefail
windows_output=$1
export APPLICATION_SHA=0b5e6b0b1d3985e6789a6d826c5a76a180642a6d
if [ -f /opt/outliner-app/docker-compose.yml ]; then
  cd /opt/outliner-app
  compose=(docker compose -f docker-compose.yml -f /opt/outliner-harness/scripts/poc/windows-linux-backend/compose.linux.yml)
  "${compose[@]}" ps --all > /opt/outliner-evidence/compose-ps.txt 2>&1 || true
  "${compose[@]}" logs --no-color > /opt/outliner-evidence/compose-logs.txt 2>&1 || true
  "${compose[@]}" down > /opt/outliner-evidence/compose-down.txt 2>&1 || true
fi
if [ -d /opt/outliner-evidence ]; then cp -a /opt/outliner-evidence/. "$windows_output/"; fi
