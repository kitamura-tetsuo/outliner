#!/usr/bin/env bash
# Bootstrap a machine so that Playwright E2E tests can run, then verify it.
#
# One reproducible entry point from a fresh clone (or a fresh cloud container):
#
#   scripts/bootstrap-e2e.sh                      # prepare + smoke test
#   scripts/bootstrap-e2e.sh client/e2e/x.spec.ts # prepare + run these specs
#   scripts/bootstrap-e2e.sh --no-test            # prepare only
#
# It is idempotent: rerunning it re-checks every prerequisite and restarts the
# services. Steps that need the public internet degrade to what the image
# already provides, so it also works in sandboxes that only allow the npm
# registry (no apt mirrors, no Playwright browser CDN, no dprint plugin CDN):
#
#   - OS packages          -> skipped when apt-get is unusable
#   - Playwright chromium  -> falls back to a pre-installed Chromium and records
#                             it in .playwright-chromium-path
#   - dprint fmt           -> uses the wasm plugins committed under
#                             dprint-plugins/ (Git LFS), so no plugin CDN is
#                             needed; still warning only (scripts/test.sh)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

source "${SCRIPT_DIR}/common-config.sh"
source "${SCRIPT_DIR}/common-functions.sh"

DEFAULT_SMOKE_SPEC="client/e2e/basic/basic.spec.ts"
RUN_TESTS=1
SPECS=()

for arg in "$@"; do
  case "$arg" in
    --no-test)
      RUN_TESTS=0
      ;;
    -h | --help)
      sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      SPECS+=("$arg")
      ;;
  esac
done

step() {
  echo ""
  echo "=== $* ==="
}

step "1/5 Checking prerequisites"
node --version
npm --version
if ! command -v java >/dev/null 2>&1; then
  echo "Java not found; the Firebase emulators need a JRE 21+."
  ensure_jdk_21
fi
java -version 2>&1 | head -n1

step "2/5 Installing npm dependencies"
# server -> shared link -> server build -> functions -> client -> scripts/tests
install_all_dependencies

step "3/5 Resolving a Chromium for Playwright"
ensure_playwright_browsers
if [ -s "${ROOT_DIR}/.playwright-chromium-path" ]; then
  echo "Playwright will launch: $(head -n1 "${ROOT_DIR}/.playwright-chromium-path")"
else
  echo "Playwright will launch its own downloaded browser."
fi

step "4/5 Starting test services"
# setup.sh owns service startup (PM2: yjs-server, log-service, vite-server,
# firebase-emulators) and waits until every port answers.
"${SCRIPT_DIR}/setup.sh"

step "5/5 Verifying the stack"
for check in \
  "SvelteKit http://127.0.0.1:${VITE_PORT}/" \
  "Functions http://127.0.0.1:${FIREBASE_FUNCTIONS_PORT}/${FIREBASE_PROJECT_ID}/us-central1/health" \
  "Auth      http://127.0.0.1:${FIREBASE_AUTH_PORT}/" \
  "Firestore http://127.0.0.1:${FIREBASE_FIRESTORE_PORT}/"; do
  name="${check%% *}"
  url="${check##* }"
  code="$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")"
  echo "${name}: HTTP ${code} (${url})"
  if [ "$code" = "000" ]; then
    echo "Error: ${name} is not responding at ${url}" >&2
    exit 1
  fi
done

if [ "$RUN_TESTS" -eq 0 ]; then
  echo ""
  echo "Environment ready. Run a spec with: scripts/test.sh client/e2e/<path>.spec.ts"
  exit 0
fi

if [ ${#SPECS[@]} -eq 0 ]; then
  SPECS=("$DEFAULT_SMOKE_SPEC")
fi

step "Running E2E specs: ${SPECS[*]}"
"${SCRIPT_DIR}/test.sh" "${SPECS[@]}"
