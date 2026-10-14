#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root/client"

# This suite deliberately builds production output and starts the real
# on-premises server in each Playwright worker. It must not inherit Firebase
# emulator/test-mode configuration from the ordinary E2E runner.
VITE_OUTLINER_DEPLOYMENT_MODE=onprem NODE_ENV=production npm run build
npx playwright test --config playwright.onprem.config.ts "$@"
