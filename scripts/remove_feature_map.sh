#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"
# Remove docs/feature-map.md if it exists and is tracked
if git ls-files --error-unmatch docs/feature-map.md > /dev/null 2>&1; then
    git rm -f docs/feature-map.md >/dev/null 2>&1 || true
fi
exit 0
