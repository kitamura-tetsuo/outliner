#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PROGRESS_FILE="$ROOT_DIR/.e2e-progress"
TEST_DIR="$ROOT_DIR/client/e2e"
TEST_FILES=$(find "$TEST_DIR" -name '*.spec.ts' -printf '%P\n' | sort)

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
    rm -f "$PROGRESS_FILE"
    for file in $TEST_FILES; do
        echo "PENDING $file" >> "$PROGRESS_FILE"
    done
fi

CHUNK_SIZE="${1:-1}"
PENDING_FILES=($(grep '^PENDING ' "$PROGRESS_FILE" | head -n "$CHUNK_SIZE" | cut -d' ' -f2-))

if [ "${#PENDING_FILES[@]}" -eq 0 ]; then
    echo "All E2E tests have been processed." 
    exit 0
fi

for file in "${PENDING_FILES[@]}"; do
    echo "=== Running Playwright test: $file ==="
    if (cd "$ROOT_DIR/client" && xvfb-run --auto-servernum --server-args="-screen 0 1280x960x24" npm run test:e2e -- "$file"); then
        status="DONE"
    else
        status="FAIL"
    fi
    sed -i "s|^PENDING $file|$status $file|" "$PROGRESS_FILE"
    echo "$status: $file"
    sleep 1
done
