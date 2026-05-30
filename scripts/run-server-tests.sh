#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Install dependencies without starting servers
SKIP_SERVER_START=1 SKIP_PORT_WAIT=1 bash "$ROOT_DIR/scripts/setup.sh"

cd "$ROOT_DIR/server"

# Use ts-node/esm loader to handle TypeScript imports in ESM environment
TS_NODE_TRANSPILE_ONLY=1 NODE_OPTIONS="--loader ts-node/esm --no-warnings" npx mocha "tests/**/*.test.{js,cjs,ts}" --exclude "tests/websocket-auth-security.test.ts" --exclude "tests/websocket-auth.test.ts" --exclude "tests/metrics.test.ts" --exclude "tests/metrics-endpoint.test.ts" --exclude "tests/idle-timeout-reconnect.test.ts" --exclude "tests/hocuspocus-server.test.ts" --exclude "tests/log-service.test.ts" --exclude "tests/hocuspocus-auth-bypass.test.ts" --exclude "tests/connection-limits.test.ts" --exclude "tests/security.test.ts" --exclude "tests/seed-api-validation.test.ts" --timeout 10000
