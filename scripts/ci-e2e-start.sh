#!/bin/bash
# Minimal E2E-specific CI startup path (issue FTR-5166 / #5166).
#
# scripts/setup.sh is a general-purpose developer-machine bootstrap: it also
# installs dprint plugins, a Python venv, pre-commit, and (on a cache miss)
# every npm dependency tree. None of that is required to run the Playwright
# suite in CI once the .github/actions/setup-e2e-deps composite action has
# already restored node_modules, the Playwright browser, and the
# server/dist build artifact for the exact commit under test.
#
# This script does only what the E2E runtime itself needs: generate test
# config, start the PM2-managed services, and block on real readiness checks
# (never fixed sleeps) before Playwright starts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

source "${SCRIPT_DIR}/common-config.sh"
source "${SCRIPT_DIR}/common-functions.sh"

echo "=== Outliner E2E CI startup (minimal path) ==="

echo "Generating emulator-specific Firebase configuration..."
node "${SCRIPT_DIR}/setup-emulator-config.js"

echo "Creating log directories..."
create_log_directories
echo "Clearing old log files..."
clear_log_files
echo "Setting up environment files..."
setup_environment_files
# Remove functions/.env to prevent firebase-functions from failing to load it
# (in CI/test we use .env.test loaded via index.js)
rm -f "${ROOT_DIR}/functions/.env"

# The client and server both compile ../shared/src, whose bare yjs/uuid/
# yjs-orderedtree imports must resolve through a consumer's node_modules. See
# the matching comment in common-functions.sh's install_all_dependencies.
if [ -f "${ROOT_DIR}/shared/package.json" ] && [ -d "${ROOT_DIR}/client/node_modules" ]; then
  ln -sfn ../client/node_modules "${ROOT_DIR}/shared/node_modules" || echo "shared link skipped"
fi

echo "Verifying server build artifact..."
if [ ! -s "${ROOT_DIR}/server/dist/server/src/index.js" ]; then
  echo "Error: server/dist/server/src/index.js is missing." >&2
  echo "The prepare-e2e-runtime job should have built and uploaded it as an artifact." >&2
  ls -R "${ROOT_DIR}/server/dist" 2>&1 || echo "server/dist missing!"
  exit 1
fi

echo "Stopping any existing servers..."
pm2 delete all >/dev/null 2>&1 || true
cleanup_ports

if pgrep -f "firebase.*emulators" >/dev/null; then
  echo "Stopping existing Firebase emulators..."
  pkill -f "firebase.*emulators" || true
fi
if pgrep -f "node dist/server/src/index.js" >/dev/null; then
  echo "Stopping existing yjs-server..."
  pkill -f "node dist/server/src/index.js" || true
fi

start_and_wait_for_services

echo "Available services:"
echo "- SvelteKit Server: http://127.0.0.1:${VITE_PORT}"
echo "- Yjs WebSocket: ws://127.0.0.1:${TEST_YJS_PORT}"
echo "- Firebase Auth: http://127.0.0.1:${FIREBASE_AUTH_PORT}"
echo "- Firebase Firestore: http://127.0.0.1:${FIREBASE_FIRESTORE_PORT}"
echo "- Firebase Functions: http://127.0.0.1:${FIREBASE_FUNCTIONS_PORT}"
