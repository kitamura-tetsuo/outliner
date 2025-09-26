#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../client"

if [ $# -eq 0 ]; then
  npm run test:unit
  npm run test:integration
  npm run test:e2e --
  exit 0
fi

TEST_TYPE="$1"
shift

case "$TEST_TYPE" in
  unit)
    npm run test:unit -- "$@"
    ;;
  integration)
    npm run test:integration -- "$@"
    ;;
  e2e)
    if [ $# -eq 0 ]; then
      npm run test:e2e --
    else
      for spec in "$@"; do
        npm run test:e2e -- "$spec"
      done
    fi
    ;;
  *)
    echo "Unknown test type: $TEST_TYPE" >&2
    echo "Usage: $0 [unit|integration|e2e] [additional args...]" >&2
    exit 1
    ;;
esac
