#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

exit_code=0

# Check all files in the repository, not just changed files
echo "Checking formatting for all files in the repository..."

# Check root directory files
npx --yes dprint check --allow-no-files . || exit_code=1

# Check functions directory if it exists
if [ -d "functions" ]; then
    echo "Checking formatting for functions directory..."
    (cd functions && npx --yes dprint check --allow-no-files .) || exit_code=1
fi

if [ $exit_code -ne 0 ]; then
  echo "\nFormatting issues detected. Run 'npx dprint fmt' to fix." >&2
fi

exit $exit_code
