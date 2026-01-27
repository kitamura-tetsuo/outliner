#!/bin/bash
# Common configuration for all scripts

# ポート番号のデフォルト値
: "${TEST_FLUID_PORT:=7092}"
: "${TEST_API_PORT:=7091}"
: "${VITE_PORT:=7090}"
: "${TEST_YJS_PORT:=7093}"

# Normalize from firebase.emulator.json when available
if [ -n "${ROOT_DIR:-}" ] && [ -f "${ROOT_DIR}/firebase.emulator.json" ]; then
  # Use node to safely read JSON without jq dependency
  _JS_READ='try{const c=require(process.argv[1]);console.log(JSON.stringify({p:c.projectId,a:c.emulators.auth.port,f:c.emulators.firestore.port,fn:c.emulators.functions.port,h:c.emulators.hosting.port,s:c.emulators.storage.port}))}catch{process.exit(1)}'
  _CFG_JSON=$(node -e "$_JS_READ" "${ROOT_DIR}/firebase.emulator.json" 2>/dev/null || echo "")
  
  if [ -n "$_CFG_JSON" ]; then
    PROJECT_FROM_CFG=$(echo "$_CFG_JSON" | node -e 'const d=JSON.parse(require("fs").readFileSync(0)); console.log(d.p)')
    AUTH_FROM_CFG=$(echo "$_CFG_JSON" | node -e 'const d=JSON.parse(require("fs").readFileSync(0)); console.log(d.a)')
    FS_FROM_CFG=$(echo "$_CFG_JSON" | node -e 'const d=JSON.parse(require("fs").readFileSync(0)); console.log(d.f)')
    FN_FROM_CFG=$(echo "$_CFG_JSON" | node -e 'const d=JSON.parse(require("fs").readFileSync(0)); console.log(d.fn)')
    HS_FROM_CFG=$(echo "$_CFG_JSON" | node -e 'const d=JSON.parse(require("fs").readFileSync(0)); console.log(d.h)')
    ST_FROM_CFG=$(echo "$_CFG_JSON" | node -e 'const d=JSON.parse(require("fs").readFileSync(0)); console.log(d.s)')
  fi
fi

# Force Project ID to match emulator config if present, otherwise fallback
export FIREBASE_PROJECT_ID="${PROJECT_FROM_CFG:-outliner-d57b0}"

# Firebase emulator ports (defaults fall back to config when present)
export FIREBASE_AUTH_PORT="${AUTH_FROM_CFG:-59099}"
export FIREBASE_FIRESTORE_PORT="${FS_FROM_CFG:-58080}"
export FIREBASE_FUNCTIONS_PORT="${FN_FROM_CFG:-57070}"
export FIREBASE_HOSTING_PORT="${HS_FROM_CFG:-57000}"
export FIREBASE_STORAGE_PORT="${ST_FROM_CFG:-59200}"

# Environment settings
export NODE_ENV=test
export TEST_ENV=localhost
export VITE_FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID}"
export VITE_YJS_PORT="${TEST_YJS_PORT}"
export TEST_API_PORT

# Firebase emulator settings for test environment
export USE_FIREBASE_EMULATOR=true

# Normalize helper hosts to match ports
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:${FIREBASE_AUTH_PORT}"
export AUTH_EMULATOR_HOST="${FIREBASE_AUTH_EMULATOR_HOST}"
export FIRESTORE_EMULATOR_HOST="127.0.0.1:${FIREBASE_FIRESTORE_PORT}"
export FIREBASE_EMULATOR_HOST="127.0.0.1:${FIREBASE_FUNCTIONS_PORT}"

# Skip Paraglide compile in tests if needed
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
  ${TEST_API_PORT}
  ${VITE_PORT}
  ${FIREBASE_FUNCTIONS_PORT}
  ${FIREBASE_AUTH_PORT}
  ${FIREBASE_FIRESTORE_PORT}
  ${FIREBASE_HOSTING_PORT}
  ${FIREBASE_STORAGE_PORT}
)

# Java Environment for Firebase (Java 21+)
if [ -d "${ROOT_DIR}/.jdk" ]; then
    export JAVA_HOME="${ROOT_DIR}/.jdk"
    export PATH="${JAVA_HOME}/bin:$PATH"
fi
