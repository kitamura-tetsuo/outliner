#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${TMPDIR:-/tmp}/firebase-devcontainer-smoke.log"
PROJECT_ID="outliner-d57b0"
EMULATOR_PID=""

cleanup() {
  if [ -n "$EMULATOR_PID" ] && kill -0 "$EMULATOR_PID" 2>/dev/null; then
    kill "$EMULATOR_PID" 2>/dev/null || true
    wait "$EMULATOR_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

"${ROOT_DIR}/scripts/require-java-21.sh"
printf 'JAVA_HOME=%s\n' "${JAVA_HOME:-<unset>}"
java -version
firebase --version

cd "$ROOT_DIR"
firebase emulators:start \
  --only auth,firestore,storage \
  --config firebase.emulator.json \
  --project "$PROJECT_ID" >"$LOG_FILE" 2>&1 &
EMULATOR_PID=$!

probe() {
  local name="$1"
  local method="$2"
  local url="$3"
  local deadline=$((SECONDS + 120))

  while (( SECONDS < deadline )); do
    if ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
      echo "Firebase emulator process exited before ${name} became ready." >&2
      cat "$LOG_FILE" >&2
      return 1
    fi
    if curl --fail --silent --show-error --max-time 2 \
      --request "$method" \
      --header "Authorization: Bearer owner" \
      "$url" >/dev/null 2>&1; then
      echo "${name} emulator is ready at ${url}"
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for ${name} emulator at ${url}." >&2
  cat "$LOG_FILE" >&2
  return 1
}

probe "Auth" GET "http://127.0.0.1:59099/emulator/v1/projects/${PROJECT_ID}/config"
probe "Firestore" DELETE "http://127.0.0.1:58080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents"
probe "Storage" GET "http://127.0.0.1:59200/v0/b/${PROJECT_ID}.appspot.com/o"

echo "Firebase Auth, Firestore, and Storage emulators are healthy in the devcontainer image."
