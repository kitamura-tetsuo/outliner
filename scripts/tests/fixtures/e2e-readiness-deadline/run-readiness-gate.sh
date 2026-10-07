#!/bin/bash
# Test harness for issue #5486: exercise the production
# start_and_wait_for_services gate (scripts/common-functions.sh) with
# controlled process/endpoint behavior.
#
# Required env: REPO_ROOT, GATE_MODE (instant|hang-fn|partial-fn|slow-fn|hang-restart|hang-start|crash-yjs-recover|crash-yjs-broken|stall-log-recover|stall-vite-only|stall-hosting-recover|flap-fn),
# GATE_BUDGET (seconds), GATE_SLOW_DELAY (seconds, slow-fn only),
# GATE_STALL (seconds, generic stall-threshold override; production default 60),
# GATE_PM2_BEHAVIOR (ok|jlist-fail|jlist-malformed|jlist-missing|jlist-trap-term; default ok),
# P_YJS P_API P_VITE P_FN P_AUTH P_FS P_HOST P_STORE (test ports).
#
# Modes:
# - instant: every stub port answers 200 immediately.
# - hang-fn: Functions port accepts the connection and never responds.
# - partial-fn: Functions port sends HTTP 200 headers with a declared body
#   and then never sends it (stalled transfer with a known status code).
# - slow-fn: Functions port answers 500 until GATE_SLOW_DELAY, then 200.
# - hang-restart: every port except hosting answers 200, hosting never
#   binds, and `pm2 restart` hangs (sleep past budget) to prove the
#   recovery branch cannot hold the gate past the deadline.
# - hang-start: `pm2 start` hangs (sleep past budget) to prove supervision
#   start itself is inside the wall-clock budget.
# - crash-yjs-recover: yjs-server is `errored` and its port never binds
#   until `pm2 restart yjs-server` flips it online and starts serving it
#   (issue #5487 REQ-001: crash recovery leads to success).
# - crash-yjs-broken: yjs-server stays `errored` and its port never binds
#   even after a restart (REQ-004/REQ-005: exactly one restart, then fail).
# - stall-log-recover: log-service stays online but its port never binds
#   until `pm2 restart log-service` serves it (REQ-002: stall recovery).
# - stall-vite-only: vite-server stays online but its port never binds
#   until `pm2 restart vite-server` serves it (REQ-007: only the affected
#   owner restarts).
# - stall-hosting-recover: every port except hosting answers 200 until
#   `pm2 restart firebase-emulators` serves hosting (REQ-006: exactly one
#   restart for the episode, no legacy second restart).
# - flap-fn: every port answers 200, but the Functions port is a single-shot
#   acceptor that handles exactly one TCP connection and then closes. The
#   first readiness evaluation's initial port sweep consumes that connection
#   and passes, while the pre-health port probe in the same evaluation finds
#   the listener gone (issue #5487, REQ-005: the evaluation must not succeed
#   without a positive Functions health response).
#
# - late-hang-restart: jlist first reports Yjs errored with one second left;
#   restart ignores TERM, so forced termination must fit that final second.
# - crash-yjs-flap: restart succeeds and marks Yjs online, but exposes only
#   one TCP connection, consumed by the initial port sweep.
#
# Every `restart` invocation prints `FAKE-PM2-RESTART <service>` so specs
# can assert the actual restart command count and target.
#
# PM2 behaviors (independent of GATE_MODE; endpoints stay healthy):
# - jlist-fail: `pm2 jlist` exits nonzero.
# - jlist-malformed: `pm2 jlist` prints non-JSON.
# - jlist-missing: `pm2 jlist` omits a required process.
# - jlist-trap-term: `pm2 jlist` ignores SIGTERM and never completes.
#
# Exits with the gate's own status: 0 when every stub service becomes
# ready within the budget, nonzero when the deadline expires.
set -euo pipefail

# Readiness probes target loopback only; a forward proxy must never
# intercept them (a proxy answering 502 with exit 0 would make curl-based
# probes report a closed port as open).
export no_proxy="127.0.0.1,localhost${no_proxy:+,$no_proxy}"
export NO_PROXY="$no_proxy"

FIXTURE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_ROOT=$(mktemp -d)
SERVER_PID=""
cleanup() {
  if [ -f "$TMP_ROOT/extra-stub-pids" ]; then
    while read -r _pid || [ -n "$_pid" ]; do
      kill "$_pid" 2>/dev/null || true
    done < "$TMP_ROOT/extra-stub-pids"
  fi
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

mkdir -p "$TMP_ROOT/bin" "$TMP_ROOT/root/logs" "$TMP_ROOT/root/server/scripts"

# Per-service PM2 status files backing the fake jlist, so a restart can
# flip a crashed service back to online the way the real daemon would.
STATUS_DIR="$TMP_ROOT/pm2-status"
mkdir -p "$STATUS_DIR"
for _svc in yjs-server log-service vite-server firebase-emulators; do
  printf 'online' > "$STATUS_DIR/$_svc"
done
if [[ "${GATE_MODE:-instant}" = crash-yjs-* ]]; then
  printf 'errored' > "$STATUS_DIR/yjs-server"
fi

# Fake pm2: every managed service stays online unless its status file says
# otherwise, diagnostics print nothing. In hang-restart mode `restart`
# sleeps past the budget; in hang-start mode `start` sleeps past the
# budget. In *-recover modes `restart <service>` flips that service online
# and starts serving its withheld port. Any other invocation exits 0.
# GATE_PM2_BEHAVIOR independently controls `jlist` to prove unavailable
# process-state evidence can never satisfy the gate (issue #5486, REQ-003).
cat > "$TMP_ROOT/bin/pm2" <<EOF
#!/bin/bash
MODE="${GATE_MODE:-instant}"
BUDGET="${GATE_BUDGET:-15}"
PM2_BEHAVIOR="${GATE_PM2_BEHAVIOR:-ok}"
STATUS_DIR="$STATUS_DIR"
FIXTURE_PY="$FIXTURE_DIR/stub-servers.py"
P_YJS_F="$P_YJS"
P_API_F="$P_API"
P_VITE_F="$P_VITE"
P_FN_F="$P_FN"
P_HOST_F="$P_HOST"
EXTRA_PIDS="$TMP_ROOT/extra-stub-pids"
START_FILE="$TMP_ROOT/gate-start"
RESTART_PID_FILE="$TMP_ROOT/restart-pid"
if [ "\${1:-}" = "start" ] && [ "\$MODE" = "late-hang-restart" ]; then
  date +%s > "\$START_FILE"
fi
if [ "\${1:-}" = "jlist" ]; then
  if [ "\$MODE" = "late-hang-restart" ]; then
    python3 -c 'import sys,time; time.sleep(max(0, int(sys.argv[1])+int(sys.argv[2])-1-time.time()))' "\$(cat "\$START_FILE")" "\$BUDGET"
    printf 'errored' > "\$STATUS_DIR/yjs-server"
  fi
  case "\$PM2_BEHAVIOR" in
    jlist-fail)
      echo "fake pm2: jlist unavailable" >&2
      exit 1
      ;;
    jlist-malformed)
      printf '%s' 'not-json{{{'
      exit 0
      ;;
    jlist-missing)
      printf '%s' '[{"name":"yjs-server","pm2_env":{"status":"online"}},{"name":"firebase-emulators","pm2_env":{"status":"online"}}]'
      exit 0
      ;;
    jlist-trap-term)
      trap '' TERM
      sleep \$((BUDGET + 30))
      exit 0
      ;;
  esac
  printf '[{"name":"yjs-server","pm2_env":{"status":"%s"}},{"name":"log-service","pm2_env":{"status":"%s"}},{"name":"vite-server","pm2_env":{"status":"%s"}},{"name":"firebase-emulators","pm2_env":{"status":"%s"}}]' "\$(cat "\$STATUS_DIR/yjs-server")" "\$(cat "\$STATUS_DIR/log-service")" "\$(cat "\$STATUS_DIR/vite-server")" "\$(cat "\$STATUS_DIR/firebase-emulators")"
  exit 0
fi
if [ "\${1:-}" = "restart" ]; then
  echo "FAKE-PM2-RESTART \${2:-}"
  if [ "\$MODE" = "late-hang-restart" ]; then
    echo "RESTART_REMAINING=\$((\$(cat "\$START_FILE") + BUDGET - \$(date +%s)))"
    exec python3 -c 'import os,signal,sys,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); open(sys.argv[1], "w").write(str(os.getpid())); time.sleep(300)' "\$RESTART_PID_FILE"
  fi
  if [ "\$MODE" = "hang-restart" ]; then
    sleep \$((BUDGET + 60))
    exit 0
  fi
  _serve() {
    python3 "\$FIXTURE_PY" instant "\$P_FN_F" 0 "\$1" &
    echo \$! >> "\$EXTRA_PIDS"
  }
  case "\${2:-}:\$MODE" in
    yjs-server:crash-yjs-recover|yjs-server:crash-yjs-restart-fail)
      printf 'online' > "\$STATUS_DIR/yjs-server"
      _serve "\$P_YJS_F"
      ;;
    yjs-server:crash-yjs-flap)
      printf 'online' > "\$STATUS_DIR/yjs-server"
      python3 "$FIXTURE_DIR/single-shot-listener.py" "\$P_YJS_F" "$TMP_ROOT/yjs-ready" &
      echo \$! >> "\$EXTRA_PIDS"
      while [ ! -f "$TMP_ROOT/yjs-ready" ]; do sleep 0.01; done
      ;;
    log-service:stall-log-recover)
      _serve "\$P_API_F"
      ;;
    vite-server:stall-vite-only)
      _serve "\$P_VITE_F"
      ;;
    firebase-emulators:stall-hosting-recover)
      _serve "\$P_HOST_F"
      ;;
  esac
  if [ "\$MODE" = "crash-yjs-restart-fail" ]; then exit 1; fi
  exit 0
fi
if [ "\$MODE" = "hang-start" ] && [ "\${1:-}" = "start" ]; then
  sleep \$((BUDGET + 60))
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
# Generic stall-threshold override for tests; production default (60s)
# stays in common-functions.sh when GATE_STALL is unset.
if [ -n "${GATE_STALL:-}" ]; then
  export E2E_SERVICE_STALL_SECONDS="$GATE_STALL"
fi

READY_AT=0
if [ "$GATE_MODE" = "slow-fn" ]; then
  READY_AT=$(($(date +%s) + GATE_SLOW_DELAY))
fi
STUB_MODE="$GATE_MODE"
# The withheld port never binds until a restart serves it (recovery modes)
# or never (hang-restart, crash-yjs-broken).
WITHHELD=""
FLAP_FN=0
case "$GATE_MODE" in
  flap-fn)
    # Functions port is served by the single-shot acceptor below instead of
    # the shared stub, so exclude it from the stub server port list.
    STUB_MODE="instant"
    WITHHELD="$P_FN"
    FLAP_FN=1
    ;;
  hang-restart|stall-hosting-recover)
    # Hosting never binds initially: serve every port except hosting.
    STUB_MODE="instant"
    WITHHELD="$P_HOST"
    ;;
  crash-yjs-*)
    WITHHELD="$P_YJS"
    ;;
  stall-log-recover|stall-log-broken)
    WITHHELD="$P_API"
    ;;
  stall-vite-only)
    WITHHELD="$P_VITE"
    ;;
esac
STUB_PORTS=()
for port in "$P_YJS" "$P_API" "$P_VITE" "$P_FN" "$P_AUTH" "$P_FS" "$P_HOST" "$P_STORE"; do
  if [ -n "$WITHHELD" ] && [ "$port" = "$WITHHELD" ]; then
    continue
  fi
  STUB_PORTS+=("$port")
done
WAIT_PORTS=()
for port in "$P_YJS" "$P_API" "$P_VITE" "$P_AUTH" "$P_FS" "$P_HOST" "$P_STORE"; do
  if [ -n "$WITHHELD" ] && [ "$port" = "$WITHHELD" ]; then
    continue
  fi
  WAIT_PORTS+=("$port")
done
python3 "$FIXTURE_DIR/stub-servers.py" \
  "$STUB_MODE" "$P_FN" "$READY_AT" \
  "${STUB_PORTS[@]}" &
SERVER_PID=$!

if [ "$FLAP_FN" = "1" ]; then
  # Single-shot Functions listener: accept exactly one TCP connection
  # (consumed by the gate's initial port sweep, which therefore passes),
  # answer it minimally, then close so the same evaluation's pre-health
  # port probe finds the listener gone. Readiness is signalled with a file
  # after bind so no probing connection consumes the single shot.
  cat > "$TMP_ROOT/flap-fn.py" <<EOF
import socket
srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("127.0.0.1", $P_FN))
srv.listen(1)
with open("$TMP_ROOT/flap-fn-ready", "w") as f:
    f.write("ready")
conn, _ = srv.accept()
try:
    conn.settimeout(5)
    try:
        conn.recv(4096)
    except OSError:
        pass
    try:
        conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
    except OSError:
        pass
finally:
    try:
        conn.close()
    except OSError:
        pass
    srv.close()
EOF
  python3 "$TMP_ROOT/flap-fn.py" &
  echo $! >> "$TMP_ROOT/extra-stub-pids"
  for _ in $(seq 1 50); do
    [ -f "$TMP_ROOT/flap-fn-ready" ] && break
    sleep 0.2
  done
fi

# Wait for the instantly-ready ports to listen before starting the gate.
for port in "${WAIT_PORTS[@]}"; do
  for _ in $(seq 1 50); do
    if curl -s --connect-timeout 1 --max-time 1 "http://127.0.0.1:${port}/" >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done
done

if [ "$GATE_MODE" = "late-hang-restart" ]; then
  # Inspect termination after the production supervisor's failure exit.
  set +e
  ( start_and_wait_for_services )
  GATE_RC=$?
  set -e
  echo "GATE_FINISH_NS=$(date +%s%N)"
  echo "GATE_DEADLINE=$(($(cat "$TMP_ROOT/gate-start") + GATE_BUDGET))"
  if [ -f "$TMP_ROOT/restart-pid" ]; then
    RESTART_PID=$(cat "$TMP_ROOT/restart-pid")
    # GNU timeout can kill its own process group, leaving the terminated
    # child awaiting adoption/reaping. A zombie is terminated, not running.
    RESTART_STATE=$(ps -o stat= -p "$RESTART_PID" || true)
    if [ -n "$RESTART_STATE" ] && [[ "$RESTART_STATE" != *Z* ]]; then
      echo "RESTART_PROCESS_SURVIVED"
      kill -KILL "$RESTART_PID" 2>/dev/null || true
    else
      echo "RESTART_PROCESS_TERMINATED"
    fi
  fi
  exit "$GATE_RC"
fi
start_and_wait_for_services
