#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"
# Remove docs/feature-map.md and docs/client-features.yaml if they exist and are tracked
targets=(docs/feature-map.md docs/client-features.yaml docs/dev-features.yaml docs/unimplemented-features.md)
for file in "${targets[@]}"; do
    if git ls-files --error-unmatch "$file" > /dev/null 2>&1; then
        git rm -f "$file" >/dev/null 2>&1 || true
    fi
done
exit 0
