#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_DIR="$(cd "${SCRIPT_DIR}/../client" && pwd)"

lint_dependencies_ready() {
  [ -x "${CLIENT_DIR}/node_modules/.bin/stylelint" ] \
    && [ -x "${CLIENT_DIR}/node_modules/.bin/eslint" ] \
    && [ -f "${CLIENT_DIR}/node_modules/stylelint-config-standard/package.json" ]
}

if lint_dependencies_ready; then
  exit 0
fi

echo "Client lint dependencies are missing; installing client dependencies (including devDependencies)..."
# Preserve an existing dependency tree if fetching fails. A fresh tree can use
# the lockfile directly. --include=dev also handles NODE_ENV=production.
if [ -d "${CLIENT_DIR}/node_modules" ]; then
  (cd "$CLIENT_DIR" && npm install --include=dev --no-audit --no-fund)
else
  (cd "$CLIENT_DIR" && npm ci --include=dev --no-audit --no-fund)
fi

if ! lint_dependencies_ready; then
  echo "Client lint dependencies are still unavailable after installation. Check stylelint, eslint, and stylelint-config-standard in client/node_modules." >&2
  exit 1
fi
