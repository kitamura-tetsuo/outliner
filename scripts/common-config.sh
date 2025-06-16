#!/bin/bash
# Common configuration for all scripts

# ポート番号のデフォルト値
: "${TEST_FLUID_PORT:=7092}"
: "${TEST_API_PORT:=7091}"
: "${VITE_PORT:=7090}"
: "${FIREBASE_PROJECT_ID:=outliner-d57b0}"

# Firebase emulator ports
: "${FIREBASE_AUTH_PORT:=59099}"
: "${FIREBASE_FIRESTORE_PORT:=58080}"
: "${FIREBASE_FUNCTIONS_PORT:=57000}"

# Environment settings
export NODE_ENV=test
export TEST_ENV=localhost
export FIREBASE_PROJECT_ID
export VITE_FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}

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
  ${TEST_FLUID_PORT}
  ${VITE_PORT}
  ${FIREBASE_FUNCTIONS_PORT}
  ${FIREBASE_AUTH_PORT}
  ${FIREBASE_FIRESTORE_PORT}
)
