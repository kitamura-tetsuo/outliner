#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Isolated package regressions provision their own disposable OS. Never run
# setup.sh (which may acquire host packages) for this explicit mode.
if [ "${1:-}" = "--isolated" ]; then
  shift
  if [ "$#" -eq 0 ]; then
    echo "--isolated requires an explicit ENV spec file." >&2
    exit 64
  fi
else
  SKIP_SERVER_START=1 SKIP_PORT_WAIT=1 bash "$ROOT_DIR/scripts/setup.sh"
fi

cd "$ROOT_DIR/scripts/tests"

if [ "$#" -gt 0 ]; then
  npx --no-install vitest run "$@"
else
  npx --no-install vitest run *.spec.ts
fi
