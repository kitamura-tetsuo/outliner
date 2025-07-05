#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

exit_code=0

if [ -n "$PRE_COMMIT_FROM_REF" ] && [ -n "$PRE_COMMIT_TO_REF" ]; then
    changed_files=$(git diff --name-only "$PRE_COMMIT_FROM_REF" "$PRE_COMMIT_TO_REF")
else
    changed_files=$(git diff --cached --name-only)
fi

if [ -z "$changed_files" ]; then
    exit 0
fi

root_files=()
functions_files=()
for f in $changed_files; do
    if [[ $f == functions/* ]]; then
        functions_files+=("$f")
    else
        root_files+=("$f")
    fi
done

if [ ${#root_files[@]} -gt 0 ]; then
    npx --yes dprint check "${root_files[@]}" || exit_code=1
fi

if [ ${#functions_files[@]} -gt 0 ] && [ -d "functions" ]; then
    (cd functions && npx --yes dprint check "${functions_files[@]}" ) || exit_code=1
fi

if [ $exit_code -ne 0 ]; then
  echo "\nFormatting issues detected. Run 'npx dprint fmt' to fix." >&2
fi

exit $exit_code
