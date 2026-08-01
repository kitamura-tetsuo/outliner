#!/bin/bash
set -euo pipefail

# This script is symlinked as .git/hooks/pre-push, so BASH_SOURCE points at the
# symlink. Resolve it to find the real scripts/ directory.
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# The dprint CLI and its wasm plugins are root devDependencies; make sure they
# are installed before invoking dprint.
if ! "${SCRIPT_DIR}/ensure-dprint-plugins.sh"; then
    echo "dprint plugins are unavailable. Skipping format check." >&2
    exit 0
fi

if ! npx dprint --version >/dev/null 2>&1; then
    echo "dprint is not available. Skipping format check." >&2
    exit 0
fi

CHANGED=$(git diff --name-only --cached --diff-filter=AM | grep -E '\.(ts|tsx|js|jsx|json|md|yaml|yml|svelte|css|html)$' || true)
if [ -z "$CHANGED" ]; then
    exit 0
fi

if ! npx dprint check $CHANGED; then
    echo "\nCommit includes unformatted files. Run 'npx dprint fmt $CHANGED' before pushing." >&2
    npx dprint fmt $CHANGED
    exit 1
fi

exit 0
