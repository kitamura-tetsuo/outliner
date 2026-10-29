#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_VERSION="$(node -p "require('${ROOT_DIR}/package.json').devDependencies['firebase-tools']")"
INSTALLED_VERSION="$(node -p "require('${ROOT_DIR}/node_modules/firebase-tools/package.json').version" 2>/dev/null || true)"

if [[ -z "${INSTALLED_VERSION}" ]]; then
  echo "Firebase CLI ${EXPECTED_VERSION} is not installed; run npm ci in ${ROOT_DIR}." >&2
  exit 1
fi

if [[ "${INSTALLED_VERSION}" != "${EXPECTED_VERSION}" ]]; then
  echo "Firebase CLI version mismatch: package.json requires ${EXPECTED_VERSION}, but node_modules contains ${INSTALLED_VERSION}. Run npm ci." >&2
  exit 1
fi

echo "Firebase CLI version: ${INSTALLED_VERSION}" >&2
exec node "${ROOT_DIR}/node_modules/firebase-tools/lib/bin/firebase.js" "$@"
