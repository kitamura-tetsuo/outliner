#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_VERSION="$(cat "${ROOT_DIR}/.firebase-tools-version")"
FIREBASE_BIN="$(command -v firebase || true)"
INSTALLED_VERSION="$("${FIREBASE_BIN:-false}" --version 2>/dev/null || true)"

if [[ -z "${INSTALLED_VERSION}" ]]; then
  echo "Firebase CLI ${EXPECTED_VERSION} is not installed." >&2
  exit 1
fi

if [[ "${INSTALLED_VERSION}" != "${EXPECTED_VERSION}" ]]; then
  echo "Firebase CLI version mismatch: policy requires ${EXPECTED_VERSION}, but PATH resolves ${INSTALLED_VERSION}." >&2
  exit 1
fi

echo "Firebase CLI version: ${INSTALLED_VERSION}" >&2
exec "${FIREBASE_BIN}" "$@"
