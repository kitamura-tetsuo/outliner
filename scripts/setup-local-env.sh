#!/bin/bash
# Create local and test environment files for client, server and functions
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

copy_if_missing() {
    local src="$1"; local dest="$2"
    if [ -f "$src" ] && [ ! -f "$dest" ]; then
        cp "$src" "$dest"
        echo "Created $(realpath --relative-to="$ROOT_DIR" "$dest")"
    fi
}

# Root env file (for dotenvx compatibility)
if [ ! -f "$ROOT_DIR/.env" ]; then
    cat >> "$ROOT_DIR/.env" <<'EOV'
# Root environment file for dotenvx compatibility
# This file is created to prevent dotenvx errors when loading environment variables
NODE_ENV=development
EOV
    echo "Created .env"
fi

# Client env files
copy_if_missing "$ROOT_DIR/client/.env.test" "$ROOT_DIR/client/.env"
if [ ! -f "$ROOT_DIR/client/.env.test" ]; then
    cat >> "$ROOT_DIR/client/.env.test" <<'EOV'
VITE_IS_TEST=true
VITE_USE_FIREBASE_EMULATOR=true
VITE_FIRESTORE_EMULATOR_HOST=localhost:58080
VITE_AUTH_EMULATOR_HOST=localhost:59099
VITE_USE_TINYLICIOUS=true
EOV
    echo "Created client/.env.test"
fi

# Server and functions env files
copy_if_missing "$ROOT_DIR/server/.env.test" "$ROOT_DIR/server/.env"
copy_if_missing "$ROOT_DIR/functions/.env.test" "$ROOT_DIR/functions/.env"

echo "Environment files are ready"
