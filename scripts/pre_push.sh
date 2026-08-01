#!/bin/bash
set -euo pipefail

# This script is symlinked as .git/hooks/pre-push, so BASH_SOURCE points at the
# symlink. Resolve it to find the real scripts/ directory.
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# This script is symlinked as .git/hooks/pre-push, so it must also perform the
# Git LFS upload that git-lfs' own pre-push hook would normally do (the
# dprint-plugins/*.wasm files are LFS objects). Run it first and pass along the
# hook arguments and stdin.
if git lfs version >/dev/null 2>&1; then
    git lfs pre-push "$@" || exit $?
fi

if ! npx --yes dprint --version >/dev/null 2>&1; then
    echo "dprint is not available. Skipping format check." >&2
    exit 0
fi

# The wasm plugins live in dprint-plugins/ (Git LFS); make sure they are real
# binaries and not unfetched LFS pointers before invoking dprint.
if ! "${SCRIPT_DIR}/ensure-dprint-plugins.sh"; then
    echo "dprint plugins are unavailable. Skipping format check." >&2
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
