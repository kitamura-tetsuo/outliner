#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
set -euo pipefail

export GIT_MERGE_AUTOEDIT=no

# Error handling
trap 'echo "Error occurred at line $LINENO. Exit code: $?" >&2' ERR

# Load common configuration and functions
source "${SCRIPT_DIR}/common-config.sh"
source "${SCRIPT_DIR}/common-functions.sh"

# Run codex-setup.sh
bash "${SCRIPT_DIR}/codex-setup.sh"

# Run tests
cd "${ROOT_DIR}/client"
npm run github:test:unit 2>&1 | tee "${ROOT_DIR}/logs/unit-test.log"
npm run github:test:integration 2>&1 | tee "${ROOT_DIR}/logs/integration-test.log"
npm run github:test:e2e 2>&1 | tee "${ROOT_DIR}/logs/e2e-test.log"

