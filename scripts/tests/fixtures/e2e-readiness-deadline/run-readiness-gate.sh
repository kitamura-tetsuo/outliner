#!/bin/bash
# Test harness for issue #5486: exercise the production
# start_and_wait_for_services gate (scripts/common-functions.sh) with
# controlled process/endpoint behavior.
#
# Required env: REPO_ROOT, GATE_MODE (instant|hang-fn|slow-fn),
# GATE_BUDGET (seconds), GATE_SLOW_DELAY (seconds, slow-fn only),
# P_YJS P_API P_VITE P_FN P_AUTH P_FS P_HOST P_STORE (test ports).
#
# Exits with the gate's own status: 0 when every stub service becomes
# ready within the budget, nonzero when the deadline expires.
set -u

FIXTURE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_ROOT=$(mktemp -d)
SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

mkdir -p "$TMP_ROOT/bin" "$TMP_ROOT/root/logs" "$TMP_ROOT/root/server/scripts"

# Fake pm2: every managed service stays online, diagnostics print nothing.
cat > "$TMP_ROOT/bin/pm2" <<'EOF'
#!/bin/bash
if [ "${1:-}" = "jlist" ]; then
  printf '%s' '[{"name":"yjs-server","pm2_env":{"status":"online"}},{"name":"vite-server","pm2_env":{"status":"online"}},{"name":"firebase-emulators","pm2_env":{"status":"online"}}]'
  exit 0
fi
exit 0
EOF
chmod +x "$TMP_ROOT/bin/pm2"
export PATH="$TMP_ROOT/bin:$PATH"

# Stub post-gate emulator init (only reached on the success path).
cat > "$TMP_ROOT/root/server/scripts/init-firebase-emulator.js" <<'EOF'
console.log("stub firebase emulator init ok");
EOF

export ROOT_DIR="$TMP_ROOT/root"
source "${REPO_ROOT}/scripts/common-config.sh"
source "${REPO_ROOT}/scripts/common-functions.sh"

export TEST_YJS_PORT="$P_YJS"
export TEST_API_PORT="$P_API"
export VITE_PORT="$P_VITE"
export FIREBASE_FUNCTIONS_PORT="$P_FN"
export FIREBASE_AUTH_PORT="$P_AUTH"
export FIREBASE_FIRESTORE_PORT="$P_FS"
export FIREBASE_HOSTING_PORT="$P_HOST"
export FIREBASE_STORAGE_PORT="$P_STORE"
REQUIRED_PORTS=("$P_YJS" "$P_API" "$P_VITE" "$P_FN" "$P_AUTH" "$P_FS" "$P_HOST" "$P_STORE")

export E2E_SERVICE_READINESS_TIMEOUT_SECONDS="$GATE_BUDGET"

READY_AT=0
if [ "$GATE_MODE" = "slow-fn" ]; then
  READY_AT=$(($(date +%s) + GATE_SLOW_DELAY))
fi
python3 "$FIXTURE_DIR/stub-servers.py" \
  "$GATE_MODE" "$P_FN" "$READY_AT" \
  "$P_YJS" "$P_API" "$P_VITE" "$P_FN" "$P_AUTH" "$P_FS" "$P_HOST" "$P_STORE" &
SERVER_PID=$!

# Wait for the instantly-ready ports to listen before starting the gate.
for port in "$P_YJS" "$P_API" "$P_VITE" "$P_AUTH" "$P_FS" "$P_HOST" "$P_STORE"; do
  for _ in $(seq 1 50); do
    if curl -s --connect-timeout 1 --max-time 1 "http://127.0.0.1:${port}/" >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done
done

start_and_wait_for_services
