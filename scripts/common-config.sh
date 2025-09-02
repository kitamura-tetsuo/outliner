#!/bin/bash
# Common configuration for all scripts

# ポート番号のデフォルト値
: "${TEST_FLUID_PORT:=7092}"
: "${TEST_API_PORT:=7091}"
: "${VITE_PORT:=7090}"
: "${TEST_YJS_PORT:=7093}"
: "${FIREBASE_PROJECT_ID:=outliner-d57b0}"

# Firebase emulator ports
: "${FIREBASE_AUTH_PORT:=59099}"
: "${FIREBASE_FIRESTORE_PORT:=58080}"
: "${FIREBASE_FUNCTIONS_PORT:=57070}"
: "${FIREBASE_HOSTING_PORT:=57000}"
: "${FIREBASE_STORAGE_PORT:=59200}"

# Environment settings
export NODE_ENV=test
export TEST_ENV=localhost
export FIREBASE_PROJECT_ID
export VITE_FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}
export VITE_YJS_PORT=${TEST_YJS_PORT}

# Firebase emulator settings for test environment
export USE_FIREBASE_EMULATOR=true
export FIREBASE_AUTH_EMULATOR_HOST=localhost:${FIREBASE_AUTH_PORT}
export FIRESTORE_EMULATOR_HOST=localhost:${FIREBASE_FIRESTORE_PORT}
export FIREBASE_EMULATOR_HOST=localhost:${FIREBASE_FUNCTIONS_PORT}

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
  ${TEST_YJS_PORT}
  ${VITE_PORT}
  ${FIREBASE_FUNCTIONS_PORT}
  ${FIREBASE_AUTH_PORT}
  ${FIREBASE_FIRESTORE_PORT}
  ${FIREBASE_HOSTING_PORT}
  ${FIREBASE_STORAGE_PORT}
)
