#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if ! npx --yes dprint --version >/dev/null 2>&1; then
    echo "dprint is not available. Skipping format check." >&2
    exit 0
fi

CHANGED=$(git diff --name-only --cached --diff-filter=AM | grep -E '\.(ts|tsx|js|jsx|json|md|yaml|yml|svelte|css|html)$' || true)
if [ -z "$CHANGED" ]; then
    exit 0
fi

if ! npx --yes dprint check $CHANGED; then
    echo "\nCommit includes unformatted files. Run 'npx dprint fmt $CHANGED' before pushing." >&2
    npx --yes dprint fmt $CHANGED
    exit 1
fi

exit 0
