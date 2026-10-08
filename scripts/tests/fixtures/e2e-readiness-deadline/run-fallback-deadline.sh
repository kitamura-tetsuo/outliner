#!/bin/bash
# Fallback-probe deadline enforcement for issue #5487 (REQ-005), outside the
# full gate: proves port_is_open never starts another fallback probe once the
# startup deadline has expired, and that forced termination of a hanging
# probe fits inside the remaining budget.
#
# Models the reported episode: nc is unavailable, the port accepts HTTP
# connections without responding (curl hangs), and lsof hangs ignoring
# SIGTERM. The fallback sequence begins near deadline expiry: nc fails fast,
# curl consumes the rest of the budget, and the lsof fallback must not start
# afterwards.
#
# Required env: REPO_ROOT, FALLBACK_BUDGET (seconds of remaining budget),
# FALLBACK_PORT (a port with nothing listening).
#
# Exits 0 only when port_is_open reports unready within the remaining budget
# plus scheduling tolerance and the lsof fallback was never started after
# the curl probe consumed the budget.
set -u

TMP_ROOT=$(mktemp -d)
cleanup() { rm -rf "$TMP_ROOT"; }
trap cleanup EXIT

mkdir -p "$TMP_ROOT/bin"
INVOCATIONS="$TMP_ROOT/invocations"
: > "$INVOCATIONS"

# nc unavailable: fail fast (models a missing nc the same way for the
# sequencing logic: the nc probe contributes no delay).
cat > "$TMP_ROOT/bin/nc" <<EOF
#!/bin/bash
echo "nc \$(date +%s.%N)" >> "$INVOCATIONS"
exit 1
EOF
# curl hangs ignoring SIGTERM (models an HTTP listener that accepts the
# connection and never responds, at the tool level).
cat > "$TMP_ROOT/bin/curl" <<EOF
#!/bin/bash
echo "curl \$(date +%s.%N)" >> "$INVOCATIONS"
trap '' TERM
sleep 300
EOF
# lsof hangs ignoring SIGTERM (the TERM-resistant fallback from the report).
cat > "$TMP_ROOT/bin/lsof" <<EOF
#!/bin/bash
echo "lsof \$(date +%s.%N)" >> "$INVOCATIONS"
trap '' TERM
sleep 300
EOF
chmod +x "$TMP_ROOT/bin/nc" "$TMP_ROOT/bin/curl" "$TMP_ROOT/bin/lsof"
export PATH="$TMP_ROOT/bin:$PATH"

export E2E_PROBE_TIMEOUT_SECONDS="$FALLBACK_BUDGET"
source "${REPO_ROOT}/scripts/common-functions.sh"

fail() { echo "FALLBACK-DEADLINE FAILURE: $1" >&2; exit 1; }

DEADLINE=$(( $(date +%s) + FALLBACK_BUDGET ))
start=$(date +%s)
if port_is_open "$FALLBACK_PORT" "$DEADLINE"; then
  fail "port_is_open reported an unready port as open"
fi
elapsed=$(( $(date +%s) - start ))
echo "fallback sequence returned unready in ${elapsed}s (remaining budget ${FALLBACK_BUDGET}s)"
if [ "$elapsed" -gt $((FALLBACK_BUDGET + 8)) ]; then
  fail "fallback sequence took ${elapsed}s, beyond remaining budget $((FALLBACK_BUDGET + 8))s"
fi

# The nc probe fails fast and the hanging curl consumes the rest of the
# budget, so the lsof fallback must never start: starting it after expiry
# (with its own timeout plus kill grace) is the reported ~6s overrun.
if grep -q '^lsof ' "$INVOCATIONS"; then
  fail "lsof fallback started after the curl probe consumed the deadline budget"
fi
grep -q '^nc ' "$INVOCATIONS" || fail "expected the nc probe to run first"
grep -q '^curl ' "$INVOCATIONS" || fail "expected the curl fallback to run"

echo "FALLBACK DEADLINE HELD"
