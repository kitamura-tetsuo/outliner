#!/bin/bash
# Direct observation-bound probes for issue #5486 (REQ-002), outside the full
# gate: proves port_is_open returns within its hard bound when the lsof
# fallback hangs and ignores SIGTERM, and proves the no-timeout watchdog
# fallback still bounds a TERM-ignoring command when GNU timeout is
# unavailable (E2E_FORCE_NO_TIMEOUT=1).
#
# Required env: REPO_ROOT, BOUND_PROBE (seconds per probe), CLOSED_PORT (a
# port with nothing listening).
#
# Exits 0 only when every probe returns a bounded failure; prints per-probe
# elapsed times for the regression assertions.
set -u

TMP_ROOT=$(mktemp -d)
cleanup() { rm -rf "$TMP_ROOT"; }
trap cleanup EXIT

mkdir -p "$TMP_ROOT/bin"
# Hanging lsof that resists graceful termination.
cat > "$TMP_ROOT/bin/lsof" <<'EOF'
#!/bin/bash
trap '' TERM
sleep 300
EOF
chmod +x "$TMP_ROOT/bin/lsof"
export PATH="$TMP_ROOT/bin:$PATH"

export E2E_PROBE_TIMEOUT_SECONDS="$BOUND_PROBE"
source "${REPO_ROOT}/scripts/common-functions.sh"

fail() { echo "OBSERVATION-BOUND FAILURE: $1" >&2; exit 1; }

# 1. lsof fallback: nc and curl fail fast on a closed port, so the hanging
# lsof (TERM ignored, forcing the kill-after path) must be reaped inside
# the bound and the port must still report closed.
start=$(date +%s)
if port_is_open "$CLOSED_PORT"; then
  fail "port_is_open reported a closed port as open"
fi
elapsed=$(( $(date +%s) - start ))
echo "lsof-fallback probe returned closed in ${elapsed}s (bound ${BOUND_PROBE}s)"
if [ "$elapsed" -gt $((BOUND_PROBE + 8)) ]; then
  fail "lsof fallback took ${elapsed}s, beyond bound $((BOUND_PROBE + 8))s"
fi

# 2. No-timeout fallback: a TERM-ignoring command must still be stopped.
export E2E_FORCE_NO_TIMEOUT=1
start=$(date +%s)
if _run_bounded "$BOUND_PROBE" bash -c 'trap "" TERM; exec sleep 300'; then
  fail "_run_bounded reported a killed command as success"
fi
elapsed=$(( $(date +%s) - start ))
echo "no-timeout probe returned nonzero in ${elapsed}s (bound ${BOUND_PROBE}s)"
if [ "$elapsed" -gt $((BOUND_PROBE + 8)) ]; then
  fail "no-timeout fallback took ${elapsed}s, beyond bound $((BOUND_PROBE + 8))s"
fi

echo "ALL OBSERVATION BOUNDS HELD"
