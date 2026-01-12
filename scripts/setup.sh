#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SETUP_SENTINEL="${ROOT_DIR}/.setup-installed"
set -euo pipefail

export GIT_MERGE_AUTOEDIT=no

SCRIPT_ARGS=("$@")
RETRY_COUNT=${SETUP_RETRY:-0}
MAX_RETRIES=${SETUP_MAX_RETRIES:-3}
unset SETUP_RETRY

handle_error() {
  local line=$1
  local exit_code=$2
  echo "Error occurred at line ${line}. Exit code: ${exit_code}" >&2
  if [ "$RETRY_COUNT" -lt "$MAX_RETRIES" ]; then
    local next=$((RETRY_COUNT + 1))
    echo "setup.sh did not complete. Re-running (attempt ${next}/${MAX_RETRIES})..."
    export SETUP_RETRY=$next
    exec "$0" "${SCRIPT_ARGS[@]}"
  else
    echo "setup.sh failed after ${MAX_RETRIES} attempts. Exiting." >&2
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
if [ -z "${CI:-}" ]; then
  fix_permissions
fi

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

# In CI/self-hosted environments, always run full setup to ensure clean state
if ([ "${CI:-}" = "true" ] || [ -n "${GITHUB_ACTIONS:-}" ]) && [ "${PREINSTALLED_ENV:-}" != "true" ]; then
  echo "CI environment detected (and PREINSTALLED_ENV not set), removing setup sentinel to ensure full setup..."
  rm -f "$SETUP_SENTINEL"
fi

# Note for env tests: keep tokens for discovery
# start_tinylicious (disabled on Yjs branch)
# start_api_server   (deprecated; handled by SvelteKit APIs)

# Setup pre-push hook
if [ -d "${ROOT_DIR}/.git/hooks" ]; then
  rm "${ROOT_DIR}/.git/hooks/pre-push" 2>/dev/null || true
  ln -s "${ROOT_DIR}/scripts/pre_push.sh" "${ROOT_DIR}/.git/hooks/pre-push" || true
fi

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
  if pip install --no-cache-dir pre-commit; then
    pre-commit install --hook-type pre-commit || echo "Warning: Failed to install pre-commit hook"
  else
    echo "Warning: Failed to install pre-commit package"
  fi
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
    if [ -z "${CI:-}" ]; then
      if [ -d "node_modules" ] && [ "$(stat -c %U node_modules 2>/dev/null || echo "unknown")" = "root" ]; then
        echo "Fixing node_modules ownership before installing vitest/playwright..."
        sudo chown -R node:node "node_modules" || true
      fi
    fi
    echo "STEP: Installing vitest playwright for testing (client)..."
    npm_config_proxy="" npm_config_https_proxy="" npm install --no-save vitest playwright
    cd "${ROOT_DIR}"
  fi

  # Ensure vitest is available for environment tests
  if [ ! -f "${ROOT_DIR}/scripts/tests/node_modules/.bin/vitest" ]; then
    echo "Installing vitest for environment tests..."
    cd "${ROOT_DIR}/scripts/tests"
    echo "STEP: Installing vitest for environment tests (tests)..."
    npm_config_proxy="" npm_config_https_proxy="" npm install --no-save vitest
    cd "${ROOT_DIR}"
  fi
  touch "$SETUP_SENTINEL"
else
  echo "Skipping dependency installation"
  ensure_python_env
  if ! command -v lsof >/dev/null 2>&1; then
    echo "lsof missing; installing OS utilities..."
    install_os_utilities
  fi
  if [ ! -d "${ROOT_DIR}/client/node_modules" ] || [ ! -d "${ROOT_DIR}/scripts/tests/node_modules" ]; then
    install_all_dependencies
  fi
  if [ ! -f "${ROOT_DIR}/client/node_modules/.bin/vitest" ] || [ ! -f "${ROOT_DIR}/client/node_modules/.bin/playwright" ]; then
    echo "Required test packages missing; installing vitest playwright..."
    cd "${ROOT_DIR}/client"
    echo "STEP: Re-installing vitest playwright (missing packages)..."
    npm_config_proxy="" npm_config_https_proxy="" npm install --no-save vitest playwright
    cd "${ROOT_DIR}"
  fi
  if [ ! -f "${ROOT_DIR}/scripts/tests/node_modules/.bin/vitest" ]; then
    echo "Required vitest missing for environment tests; installing..."
    cd "${ROOT_DIR}/scripts/tests"
    echo "STEP: Re-installing vitest (missing packages)..."
    npm_config_proxy="" npm_config_https_proxy="" npm install --no-save vitest
    cd "${ROOT_DIR}"
  fi

  # Ensure server is built if dist is missing (critical for Yjs server)
  if [ ! -d "${ROOT_DIR}/server/dist" ]; then
    echo "Server build missing. Building server..."
    cd "${ROOT_DIR}/server"
    npm_ci_if_needed
    npm run build
    cd "${ROOT_DIR}"
  fi
fi

echo "Ensuring node-canvas native dependencies..."
ensure_canvas_native_deps

# Ensure essential client CLI tools are available
cd "${ROOT_DIR}/client"
# Fix permissions before checking/installing client CLI tools
if [ -z "${CI:-}" ]; then
  if [ -d "node_modules" ] && [ "$(stat -c %U node_modules 2>/dev/null || echo "unknown")" = "root" ]; then
    echo "Fixing node_modules ownership before checking client CLI tools..."
    sudo chown -R node:node "node_modules" || true
  fi
fi
if [ ! -f node_modules/.bin/paraglide-js ] || [ ! -f node_modules/.bin/dotenvx ]; then
  echo "Missing client CLI tools; reinstalling client dependencies..."
  echo "STEP: Reinstalling client dependencies (npm ci)..."
  npm_config_proxy="" npm_config_https_proxy="" npm ci
fi
cd "${ROOT_DIR}"

# Ensure pm2 is available before managing processes
if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 not found. Installing pm2..."
  npm_config_proxy="" npm_config_https_proxy="" npm install -g pm2
  # Refresh PATH to include newly installed pm2
  NPM_GLOBAL_BIN="$(npm bin -g 2>/dev/null || true)"
  if [ -n "$NPM_GLOBAL_BIN" ] && [[ ":$PATH:" != *":$NPM_GLOBAL_BIN:"* ]]; then
    export PATH="$NPM_GLOBAL_BIN:$PATH"
  fi
fi

# Stop any existing servers to ensure clean restart
echo "Stopping any existing servers..."
pm2 delete all || true

# Kill existing firebase emulators running in background (not managed by PM2)
if pgrep -f "firebase.*emulators" > /dev/null; then
  echo "Stopping existing Firebase emulators..."
  pkill -f "firebase.*emulators" || true
fi

# Kill existing yjs-server running in background (might be left over)
if pgrep -f "node dist/index.js" > /dev/null; then
  echo "Stopping existing yjs-server..."
  pkill -f "node dist/index.js" || true
fi

sleep 3

# Start Firebase emulators directly (not via PM2) - Firebase emulators don't work well under PM2
if [ "${SKIP_SERVER_START:-0}" -eq 1 ]; then
  echo "Skipping server start as requested"
else
  echo "Starting Firebase emulators directly..."
  # Use nohup and setsid to properly daemonize the process
  # Firebase emulators use Java and may fork, so we need to ensure they stay running
  cd "${ROOT_DIR}"
  setsid nohup firebase emulators:start --only auth,firestore,functions,hosting,storage --config firebase.emulator.json --project outliner-d57b0 \
    > "${ROOT_DIR}/logs/firebase-emulators.log" 2>&1 &
  FIREBASE_PID=$!
  echo "Firebase emulators start command issued (PID: $FIREBASE_PID)"

  # Wait for Firebase emulators to be ready with better error detection
  echo "Waiting for Firebase emulators to be ready..."

  # First wait for Functions emulator (backend)
  if wait_for_port ${FIREBASE_FUNCTIONS_PORT}; then
    echo "Firebase Functions emulator is ready"
  else
    echo "Warning: Firebase Functions emulator may not have started correctly"
    echo "Checking emulator logs for errors..."
    if [ -f "${ROOT_DIR}/logs/firebase-emulators.log" ]; then
      tail -50 "${ROOT_DIR}/logs/firebase-emulators.log" || true
    fi
  fi

  # Also wait for Hosting emulator (frontend - required for /api/ rewrites)
  if wait_for_port ${FIREBASE_HOSTING_PORT}; then
    echo "Firebase Hosting emulator is ready"
  else
    echo "Warning: Firebase Hosting emulator may not have started correctly"
  fi

  # Wait additional time for Firebase Functions to fully load their definitions
  # The port may be open but Functions need time to register their routes
  echo "Waiting for Firebase Functions to fully initialize..."
  sleep 20

  # Verify Firebase Functions are working by checking API endpoint through Hosting emulator
  # Tests access Functions through Hosting at http://localhost:57000/api/...
  echo "Verifying Firebase Functions API through Hosting emulator..."
  API_READY=false
  for i in {1..36}; do
    # Check through Hosting emulator which is what the tests use
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${FIREBASE_HOSTING_PORT}/api/health" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
      echo "Firebase Functions API is ready (via Hosting)"
      API_READY=true
      break
    fi
    echo "Waiting for Firebase Functions API... (attempt ${i}/36, got $HTTP_CODE)"
    sleep 5
  done

  if [ "$API_READY" = false ]; then
    echo "Warning: Firebase Functions API may not be fully ready"
    echo "Checking emulator logs..."
    if [ -f "${ROOT_DIR}/logs/firebase-emulators.log" ]; then
      echo "=== Firebase Emulator Logs (Last 200 lines) ==="
      tail -200 "${ROOT_DIR}/logs/firebase-emulators.log" || true
      echo "=============================================="
    fi
  fi

  # Initialize Firebase emulator (creates test users, etc.)
  echo "Initializing Firebase emulator..."
  export FIREBASE_AUTH_EMULATOR_HOST="localhost:${FIREBASE_AUTH_PORT}"
  export AUTH_EMULATOR_HOST="localhost:${FIREBASE_AUTH_PORT}"
  export FIRESTORE_EMULATOR_HOST="localhost:${FIREBASE_FIRESTORE_PORT}"
  export FIREBASE_EMULATOR_HOST="localhost:${FIREBASE_FUNCTIONS_PORT}"
  cd "${ROOT_DIR}/server/scripts"
  node init-firebase-emulator.js || echo "Warning: Firebase emulator initialization had issues"
  cd "${ROOT_DIR}"

  # Verify emulators are actually running by checking for firebase processes
  sleep 2
  if ! pgrep -f "firebase.*emulators" > /dev/null 2>&1; then
    echo "ERROR: Firebase emulators process not found after start command"
    echo "Attempting direct start..."
    setsid nohup firebase emulators:start --only auth,firestore,functions,hosting,storage --config firebase.emulator.json --project outliner-d57b0 \
      > "${ROOT_DIR}/logs/firebase-emulators.log" 2>&1 &
    sleep 10
  fi

  echo "Starting PM2-managed services (yjs-server, vite-server)..."
  # Only start the non-Firebase services via PM2
  pm2 start ecosystem.config.cjs --only yjs-server,vite-server

  # Wait for Yjs server WebSocket to be ready (critical for Yjs sync tests)
  echo "Waiting for Yjs WebSocket server to be ready..."
  YJS_READY=false
  for i in {1..24}; do
    # Check if the Yjs WebSocket port is open and responding
    if nc -z localhost ${TEST_YJS_PORT} 2>/dev/null; then
      # Additional check: verify it's actually a WebSocket by checking the response
      WS_CHECK=$(curl -s --connect-timeout 2 --max-time 5 "http://localhost:${TEST_YJS_PORT}/" 2>/dev/null || echo "")
      if [ -n "$WS_CHECK" ] || nc -z localhost ${TEST_YJS_PORT} 2>/dev/null; then
        echo "Yjs WebSocket server is ready on port ${TEST_YJS_PORT}"
        YJS_READY=true
        break
      fi
    fi
    echo "Waiting for Yjs WebSocket... (attempt ${i}/24)"
    sleep 5
  done

  if [ "$YJS_READY" = false ]; then
    echo "Warning: Yjs WebSocket server may not be fully ready"
    echo "Checking PM2 logs..."
    pm2 logs yjs-server --lines 50 --nostream 2>/dev/null || true
  fi

  # Verify PM2 services started successfully
  pm2 list
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
