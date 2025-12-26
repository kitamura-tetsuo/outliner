#!/bin/bash
# Common configuration for all scripts

# ポート番号のデフォルト値
: "${TEST_FLUID_PORT:=7092}"
: "${TEST_API_PORT:=7091}"
: "${VITE_PORT:=7090}"
: "${TEST_YJS_PORT:=7093}"
: "${FIREBASE_PROJECT_ID:=outliner-d57b0}"

# Normalize Firebase emulator ports from firebase.emulator.json when available
# This prevents drift and overrides any external mismatched env like 9100
if [ -n "${ROOT_DIR:-}" ] && [ -f "${ROOT_DIR}/firebase.emulator.json" ]; then
  # Use node to safely read JSON without jq dependency
  AUTH_FROM_CFG=$(node -e 'try{const c=require(process.argv[1]);console.log(c.emulators.auth.port)}catch{process.exit(1)}' "${ROOT_DIR}/firebase.emulator.json" 2>/dev/null || true)
  FS_FROM_CFG=$(node -e 'try{const c=require(process.argv[1]);console.log(c.emulators.firestore.port)}catch{process.exit(1)}' "${ROOT_DIR}/firebase.emulator.json" 2>/dev/null || true)
  FN_FROM_CFG=$(node -e 'try{const c=require(process.argv[1]);console.log(c.emulators.functions.port)}catch{process.exit(1)}' "${ROOT_DIR}/firebase.emulator.json" 2>/dev/null || true)
  HS_FROM_CFG=$(node -e 'try{const c=require(process.argv[1]);console.log(c.emulators.hosting.port)}catch{process.exit(1)}' "${ROOT_DIR}/firebase.emulator.json" 2>/dev/null || true)
  ST_FROM_CFG=$(node -e 'try{const c=require(process.argv[1]);console.log(c.emulators.storage.port)}catch{process.exit(1)}' "${ROOT_DIR}/firebase.emulator.json" 2>/dev/null || true)
fi

# Check if we're running in a test context before setting defaults
# If VITE_IS_TEST is already set, we're in test environment
if [ "${VITE_IS_TEST:-}" = "true" ] || [ "${NODE_ENV:-}" = "test" ]; then
    # For test environment, use test-project-id as default if not already set by .env files
    : "${FIREBASE_PROJECT_ID:=test-project-id}"
else
    # For non-test environments, use the default production project ID
    : "${FIREBASE_PROJECT_ID:=outliner-d57b0}"
fi

# Firebase emulator ports (defaults fall back to config when present)
: "${FIREBASE_AUTH_PORT:=${AUTH_FROM_CFG:-59099}}"
: "${FIREBASE_FIRESTORE_PORT:=${FS_FROM_CFG:-58080}}"
: "${FIREBASE_FUNCTIONS_PORT:=${FN_FROM_CFG:-57070}}"
: "${FIREBASE_HOSTING_PORT:=${HS_FROM_CFG:-57000}}"
: "${FIREBASE_STORAGE_PORT:=${ST_FROM_CFG:-59200}}"

# Environment settings
export NODE_ENV=test
export TEST_ENV=localhost
export FIREBASE_PROJECT_ID
export VITE_FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}
export VITE_YJS_PORT=${TEST_YJS_PORT}

# Firebase emulator settings for test environment
export USE_FIREBASE_EMULATOR=true

# If external env pre-sets a different port (e.g., 9100/9099), normalize to repo config
_AUTH_HOST_CURRENT=${FIREBASE_AUTH_EMULATOR_HOST:-}
_AUTH_HOST_EXPECTED="localhost:${FIREBASE_AUTH_PORT}"
if [ -n "${_AUTH_HOST_CURRENT}" ] && [ "${_AUTH_HOST_CURRENT}" != "${_AUTH_HOST_EXPECTED}" ]; then
  echo "Warning: Overriding FIREBASE_AUTH_EMULATOR_HOST (${_AUTH_HOST_CURRENT}) -> ${_AUTH_HOST_EXPECTED}"
fi
export FIREBASE_AUTH_EMULATOR_HOST=${_AUTH_HOST_EXPECTED}
export AUTH_EMULATOR_HOST=${_AUTH_HOST_EXPECTED}  # legacy var used by some tools

_FS_HOST_CURRENT=${FIRESTORE_EMULATOR_HOST:-}
_FS_HOST_EXPECTED="localhost:${FIREBASE_FIRESTORE_PORT}"
if [ -n "${_FS_HOST_CURRENT}" ] && [ "${_FS_HOST_CURRENT}" != "${_FS_HOST_EXPECTED}" ]; then
  echo "Warning: Overriding FIRESTORE_EMULATOR_HOST (${_FS_HOST_CURRENT}) -> ${_FS_HOST_EXPECTED}"
fi
export FIRESTORE_EMULATOR_HOST=${_FS_HOST_EXPECTED}

_FN_HOST_CURRENT=${FIREBASE_EMULATOR_HOST:-}
_FN_HOST_EXPECTED="localhost:${FIREBASE_FUNCTIONS_PORT}"
if [ -n "${_FN_HOST_CURRENT}" ] && [ "${_FN_HOST_CURRENT}" != "${_FN_HOST_EXPECTED}" ]; then
  echo "Warning: Overriding FIREBASE_EMULATOR_HOST (${_FN_HOST_CURRENT}) -> ${_FN_HOST_EXPECTED}"
fi
export FIREBASE_EMULATOR_HOST=${_FN_HOST_EXPECTED}

# Skip Paraglide compile in tests
: "${SKIP_PARAGLIDE_COMPILE:=}"

# Log directories
LOG_DIRS=(
  "${ROOT_DIR}/logs"
  "${ROOT_DIR}/client/logs"
  "${ROOT_DIR}/client/e2e/logs"
  "${ROOT_DIR}/server/logs"
  "${ROOT_DIR}/functions/logs"
)

# Ports to monitor for readiness
REQUIRED_PORTS=(
  ${TEST_API_PORT}
  ${TEST_YJS_PORT}
  ${VITE_PORT}
  ${FIREBASE_FUNCTIONS_PORT}
  ${FIREBASE_AUTH_PORT}
  ${FIREBASE_FIRESTORE_PORT}
  ${FIREBASE_HOSTING_PORT}
  ${FIREBASE_STORAGE_PORT}
)
