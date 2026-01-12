#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Install dependencies without starting servers
SKIP_SERVER_START=1 SKIP_PORT_WAIT=1 bash "$ROOT_DIR/scripts/setup.sh"

cd "$ROOT_DIR/server"

# Use ts-node/esm loader to handle TypeScript imports in ESM environment
NODE_OPTIONS="--loader ts-node/esm --no-warnings" npx mocha "tests/**/*.test.{js,cjs,ts}" --timeout 10000
