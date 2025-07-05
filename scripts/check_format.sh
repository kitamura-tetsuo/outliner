#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

exit_code=0

# Check all files in the repository, not just changed files
echo "Checking formatting for all files in the repository..."

# Get all files that dprint should check and run check on them
file_paths=$(npx --yes dprint output-file-paths 2>/dev/null || true)

if [ -n "$file_paths" ]; then
    echo "$file_paths" | xargs npx --yes dprint check || exit_code=1
else
    echo "No files found to check."
fi

if [ $exit_code -ne 0 ]; then
  echo "\nFormatting issues detected. Run 'npx dprint fmt' to fix." >&2
fi


exit $exit_code
