#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SETUP_SENTINEL="${ROOT_DIR}/.codex-setup-installed"
set -euo pipefail

export GIT_MERGE_AUTOEDIT=no

SCRIPT_ARGS=("$@")
RETRY_COUNT=${CODEX_SETUP_RETRY:-0}
MAX_RETRIES=${CODEX_SETUP_MAX_RETRIES:-3}
unset CODEX_SETUP_RETRY

handle_error() {
  local line=$1
  local exit_code=$2
  echo "Error occurred at line ${line}. Exit code: ${exit_code}" >&2
  if [ "$RETRY_COUNT" -lt "$MAX_RETRIES" ]; then
    local next=$((RETRY_COUNT + 1))
    echo "codex-setup.sh did not complete. Re-running (attempt ${next}/${MAX_RETRIES})..."
    export CODEX_SETUP_RETRY=$next
    exec "$0" "${SCRIPT_ARGS[@]}"
  else
    echo "codex-setup.sh failed after ${MAX_RETRIES} attempts. Exiting." >&2
    exit "${exit_code}"
  fi
}

trap 'handle_error ${LINENO} $?' ERR

# Load common configuration and functions
source "${SCRIPT_DIR}/common-config.sh"
source "${SCRIPT_DIR}/common-functions.sh"

# Fix permissions before proceeding
fix_permissions() {
  echo "Fixing directory permissions..."
  # Fix ownership of client directory and its contents
  if [ -d "${ROOT_DIR}/client" ]; then
    # Fix ownership of node_modules if it exists and is owned by root
    if [ -d "${ROOT_DIR}/client/node_modules" ] && [ "$(stat -c %U ${ROOT_DIR}/client/node_modules)" = "root" ]; then
      echo "Fixing node_modules ownership..."
      sudo chown -R node:node "${ROOT_DIR}/client/node_modules" || true
    fi
  fi
  
  # Fix ownership of other key directories
  for dir in "${ROOT_DIR}/client" "${ROOT_DIR}/server" "${ROOT_DIR}/functions" "${ROOT_DIR}/scripts/tests"; do
    if [ -d "$dir" ]; then
      sudo chown -R node:node "$dir" || true
    fi
  done
}

# Fix permissions before proceeding
fix_permissions

ensure_python_env() {
  echo "Ensuring Python virtual environment..."
  if [ ! -d "${ROOT_DIR}/.venv" ]; then
    python3 -m venv "${ROOT_DIR}/.venv"
  fi
  # shellcheck disable=SC1090
  source "${ROOT_DIR}/.venv/bin/activate"
  if [ -f "${ROOT_DIR}/scripts/requirements.txt" ]; then
    pip install --no-cache-dir -r "${ROOT_DIR}/scripts/requirements.txt"
  fi
}

# Bypass heavy setup steps if sentinel file exists
if [ -f "$SETUP_SENTINEL" ]; then
  echo "Setup already completed, skipping installation steps"
  SKIP_INSTALL=1
else
  SKIP_INSTALL=0
fi

echo "=== Outliner Test Environment Setup ==="
echo "ROOT_DIR: ${ROOT_DIR}"

# Note for env tests: keep tokens for discovery
# start_tinylicious (disabled on Yjs branch)
# start_api_server   (deprecated; handled by SvelteKit APIs)

# Setup pre-push hook
rm ${ROOT_DIR}/.git/hooks/pre-push || true
ln -s ${ROOT_DIR}/scripts/pre_push.sh ${ROOT_DIR}/.git/hooks/pre-push || true

# Generate emulator-specific Firebase configuration
echo "Generating emulator-specific Firebase configuration..."
node "${SCRIPT_DIR}/setup-emulator-config.js"

# Initialize environment
echo "Loading NVM..."
load_nvm
NPM_GLOBAL_BIN="$(npm bin -g 2>/dev/null || true)"
if [ -n "$NPM_GLOBAL_BIN" ] && [[ ":$PATH:" != *":$NPM_GLOBAL_BIN:"* ]]; then
  export PATH="$NPM_GLOBAL_BIN:$PATH"
fi
echo "Creating log directories..."
create_log_directories
echo "Clearing old log files..."
clear_log_files
echo "Setting up environment files..."
setup_environment_files

# Install required tools and dependencies on first run
if [ "$SKIP_INSTALL" -eq 0 ]; then
  echo "Installing global packages..."
  install_global_packages
  echo "Installing OS utilities..."
  install_os_utilities
  echo "Installing Python packages..."
  retry_apt_get update
  retry_apt_get -y install python3-venv python3-pip

  # Create Python virtual environment if it doesn't exist
  ensure_python_env

  # Install pre-commit via pip
  pip install --no-cache-dir pre-commit
  pre-commit install --hook-type pre-commit
  echo "Installing all dependencies..."
  install_all_dependencies

  # Install Playwright browser (system dependencies should be handled by install_os_utilities)
  cd "${ROOT_DIR}/client"
  npx --yes playwright install chromium
  cd "${ROOT_DIR}"

  # Ensure vitest and playwright packages are available for npm test
  if [ ! -f "${ROOT_DIR}/client/node_modules/.bin/vitest" ] || [ ! -f "${ROOT_DIR}/client/node_modules/.bin/playwright" ]; then
    echo "Installing vitest playwright for testing..."
    cd "${ROOT_DIR}/client"
    # Fix permissions before installing
    if [ -d "node_modules" ] && [ "$(stat -c %U node_modules 2>/dev/null || echo "unknown")" = "root" ]; then
      echo "Fixing node_modules ownership before installing vitest/playwright..."
      sudo chown -R node:node "node_modules" || true
    fi
    npm --proxy='' --https-proxy='' install --no-save vitest playwright
    cd "${ROOT_DIR}"
  fi

  # Ensure vitest is available for environment tests
  if [ ! -f "${ROOT_DIR}/scripts/tests/node_modules/.bin/vitest" ]; then
    echo "Installing vitest for environment tests..."
    cd "${ROOT_DIR}/scripts/tests"
    npm --proxy='' --https-proxy='' install --no-save vitest
    cd "${ROOT_DIR}"
  fi
  touch "$SETUP_SENTINEL"
else
  echo "Skipping dependency installation"
  ensure_python_env
  if ! command -v xvfb-run >/dev/null 2>&1; then
    echo "xvfb-run missing; installing OS utilities..."
    install_os_utilities
  fi
  if [ ! -d "${ROOT_DIR}/client/node_modules" ] || [ ! -d "${ROOT_DIR}/scripts/tests/node_modules" ]; then
    install_all_dependencies
  fi
  if [ ! -f "${ROOT_DIR}/client/node_modules/.bin/vitest" ] || [ ! -f "${ROOT_DIR}/client/node_modules/.bin/playwright" ]; then
    echo "Required test packages missing; installing vitest playwright..."
    cd "${ROOT_DIR}/client"
    npm --proxy='' --https-proxy='' install --no-save vitest playwright
    cd "${ROOT_DIR}"
  fi
  if [ ! -f "${ROOT_DIR}/scripts/tests/node_modules/.bin/vitest" ]; then
    echo "Required vitest missing for environment tests; installing..."
    cd "${ROOT_DIR}/scripts/tests"
    npm --proxy='' --https-proxy='' install --no-save vitest
    cd "${ROOT_DIR}"
  fi
fi

echo "Ensuring node-canvas native dependencies..."
ensure_canvas_native_deps

# Ensure essential client CLI tools are available
cd "${ROOT_DIR}/client"
# Fix permissions before checking/installing client CLI tools
if [ -d "node_modules" ] && [ "$(stat -c %U node_modules 2>/dev/null || echo "unknown")" = "root" ]; then
  echo "Fixing node_modules ownership before checking client CLI tools..."
  sudo chown -R node:node "node_modules" || true
fi
if [ ! -f node_modules/.bin/paraglide-js ] || [ ! -f node_modules/.bin/dotenvx ]; then
  echo "Missing client CLI tools; reinstalling client dependencies..."
  npm --proxy='' --https-proxy='' ci
fi
cd "${ROOT_DIR}"

# Stop any existing servers to ensure clean restart
echo "Stopping any existing servers..."
kill_ports || echo "Warning: Some ports could not be killed"
sleep 2

# Start all test servers unless skipped
if [ "${SKIP_SERVER_START:-0}" -eq 1 ]; then
  echo "Skipping server start as requested"
else
  echo "Starting test servers..."
  echo "Starting Firebase emulator..."
  start_firebase_emulator
  echo "Starting Yjs server..."
  start_yjs_server
  echo "Starting SvelteKit server..."
  start_sveltekit_server
  echo "Starting API server..."
  start_api_server
fi

# Wait for all services to be ready
if [ "${SKIP_PORT_WAIT:-0}" -eq 1 ]; then
  echo "Skipping port wait as requested"
else
  echo "Waiting for all services to be ready..."
  if wait_for_all_ports; then
    echo "=== All test services are ready! ==="
  else
    echo "=== Test environment setup completed with warnings ==="
    echo "Some services may not be fully ready, but the environment is usable"
  fi
fi
sleep 10

echo "Available services:"
echo "- SvelteKit Server: http://localhost:${VITE_PORT}"
echo "- API Server: (disabled; using SvelteKit APIs)"
echo "- Yjs WebSocket: ws://localhost:${TEST_YJS_PORT}"
echo "- Firebase Auth: http://localhost:${FIREBASE_AUTH_PORT}"
echo "- Firebase Firestore: http://localhost:${FIREBASE_FIRESTORE_PORT}"
echo "- Firebase Functions: http://localhost:${FIREBASE_FUNCTIONS_PORT}"
