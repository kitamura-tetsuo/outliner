#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Ensure local services are running for tests
bash "$ROOT_DIR/scripts/codex-setp.sh"

cd "$ROOT_DIR/client"
xvfb-run --auto-servernum --server-args="-screen 0 1280x960x24" npm run test:e2e -- "$@"
