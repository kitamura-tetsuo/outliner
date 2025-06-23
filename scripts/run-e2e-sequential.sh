#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Setup local services
bash "$ROOT_DIR/scripts/codex-setup.sh"

TEST_DIR="$ROOT_DIR/client/e2e"
TEST_FILES=$(find "$TEST_DIR" -name '*.spec.ts' | sort)

for file in $TEST_FILES; do
    echo "=== Running Playwright test: $file ==="
    bash "$ROOT_DIR/scripts/run-tests.sh" "$file" || echo "Test failed or timed out: $file"
done
