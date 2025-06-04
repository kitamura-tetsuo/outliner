#!/bin/bash
# Create local and test environment files for client, server and functions
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

copy_if_missing() {
    local src="$1"; local dest="$2"
    if [ -f "$src" ] && [ ! -f "$dest" ]; then
        cp "$src" "$dest"
        echo "Created $(realpath --relative-to="$ROOT_DIR" "$dest")"
    fi
}

# Client env files
copy_if_missing "$ROOT_DIR/client/.env.example" "$ROOT_DIR/client/.env"
if [ ! -f "$ROOT_DIR/client/.env.test" ]; then
    cp "$ROOT_DIR/client/.env.example" "$ROOT_DIR/client/.env.test"
    cat >> "$ROOT_DIR/client/.env.test" <<'EOV'
VITE_IS_TEST=true
VITE_USE_FIREBASE_EMULATOR=true
VITE_FIRESTORE_EMULATOR_HOST=localhost
VITE_USE_TINYLICIOUS=true
EOV
    echo "Created client/.env.test"
fi
copy_if_missing "$ROOT_DIR/client/.env.test" "$ROOT_DIR/client/.env.localhost.test"

# Server and functions env files
copy_if_missing "$ROOT_DIR/server/.env.example" "$ROOT_DIR/server/.env"
copy_if_missing "$ROOT_DIR/server/.env" "$ROOT_DIR/server/.env.localhost.test"
copy_if_missing "$ROOT_DIR/functions/.env.example" "$ROOT_DIR/functions/.env"

echo "Environment files are ready"
