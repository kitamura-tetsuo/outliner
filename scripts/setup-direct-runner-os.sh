#!/usr/bin/env bash
# Strict direct-runner CI boundary. Local setup.sh retains its degraded mode.
set -euo pipefail
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
export ROOT_DIR

if [ "${1:-}" = "--worker" ]; then
  source "$ROOT_DIR/scripts/common-functions.sh"
  export DIRECT_RUNNER_OS_STRICT=1
  direct_runner_stage prerequisites
  if [ "${SKIP_APT_INSTALL:-0}" = "1" ]; then
    echo "Error: direct-runner setup cannot skip required OS acquisition." >&2
    exit 1
  fi
  browser=${E2E_BROWSER:-chromium}
  case "$browser" in chromium|firefox) ;; *) echo "Unsupported browser: $browser" >&2; exit 1 ;; esac
  pinned=$(playwright_pinned_version)
  if [ -z "$pinned" ]; then echo "Cannot read locked Playwright version." >&2; exit 1; fi
  for package in @playwright/test playwright playwright-core; do
    installed=$(node -p "require('$ROOT_DIR/client/node_modules/$package/package.json').version")
    if [ "$installed" != "$pinned" ]; then
      echo "Locked Playwright mismatch: $package installed=$installed expected=$pinned" >&2
      exit 1
    fi
  done
  install_os_utilities --os-only
  # Always required, even on a browser-cache hit. Never use cache as OS evidence.
  apt_is_available
  direct_runner_stage "playwright-install-deps ($browser, $pinned)"
  node "$ROOT_DIR/client/node_modules/playwright/cli.js" install-deps "$browser"
  # Check again after Playwright's package transaction, before browser readiness.
  install_os_utilities --os-only
  direct_runner_stage "playwright-browser ($browser, $pinned)"
  ensure_playwright_browsers "$browser"
  direct_runner_stage ready
  exit 0
fi

# Includes all probes, APT retries, repair, install-deps and browser preparation.
# 595s work + at most 5s TERM-to-KILL grace = 600s, below the 30m E2E job.
# Require GNU timeout's process-group supervision for sudo/APT descendants;
# _run_bounded's portable watchdog only signals its immediate child PID.
budget=${E2E_OS_BUDGET_SECONDS:-600}
if ! [[ "$budget" =~ ^[0-9]{1,3}$ ]]; then
  echo "E2E_OS_BUDGET_SECONDS must be an integer from 6 through 600." >&2
  exit 64
fi
budget=$((10#$budget))
if (( budget < 6 || budget > 600 )); then
  echo "E2E_OS_BUDGET_SECONDS must be an integer from 6 through 600." >&2
  exit 64
fi
command -v timeout >/dev/null || { echo "GNU timeout is required for direct-runner setup." >&2; exit 1; }
E2E_OS_STAGE_FILE=$(mktemp)
export E2E_OS_STAGE_FILE
trap 'rm -f "$E2E_OS_STAGE_FILE"' EXIT
printf '%s\n' starting > "$E2E_OS_STAGE_FILE"
started=$SECONDS
status=0
timeout --signal=TERM --kill-after=5 "$((budget - 5))" bash "$0" --worker || status=$?
stage=$(cat "$E2E_OS_STAGE_FILE")
echo "Direct-runner setup outcome: stage=$stage exit=$status elapsed=$((SECONDS - started))s aggregate-budget=${budget}s"
if (( status != 0 )); then
  echo "Error: direct-runner OS/browser setup failed; tests are not ready (timeout exits: 124/137)." >&2
fi
exit "$status"
