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

  # Remove sentinel to ensure clean retry
  rm -f "$SETUP_SENTINEL"

  if [ "$RETRY_COUNT" -lt "$MAX_RETRIES" ]; then
    local next=$((RETRY_COUNT + 1))
    echo "setup.sh did not complete. Retrying (attempt ${next}/${MAX_RETRIES})..."
    export SETUP_RETRY=$next
    exec "${SCRIPT_DIR}/$(basename "${BASH_SOURCE[0]}")" "${SCRIPT_ARGS[@]}"
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
    if [ -d "${ROOT_DIR}/client/node_modules" ] && [ "$(stat -c %U "${ROOT_DIR}/client/node_modules")" = "root" ]; then
      if id "node" >/dev/null 2>&1; then
        echo "Fixing node_modules ownership..."
        sudo chown -R node:node "${ROOT_DIR}/client/node_modules" || true
      else
         echo "Skipping node_modules ownership fix (user 'node' not found)"
      fi
    fi
  fi
  
  # Fix ownership of other key directories
  for dir in "${ROOT_DIR}/client" "${ROOT_DIR}/server" "${ROOT_DIR}/functions" "${ROOT_DIR}/scripts/tests"; do
    if [ -d "$dir" ]; then
      if id "node" >/dev/null 2>&1; then
        sudo chown -R node:node "$dir" || true
      fi
    fi
  done

  # Fix Docker socket permissions if it exists
  if [ -S /var/run/docker.sock ]; then
    echo "Fixing Docker socket permissions..."
    sudo chmod 666 /var/run/docker.sock || true
  fi
}

# Fix permissions before proceeding
if [ -z "${CI:-}" ]; then
  fix_permissions
fi

ensure_python_env() {
  echo "Ensuring Python virtual environment..."
  local VENV="${ROOT_DIR}/.venv"
  if [ ! -x "${VENV}/bin/python" ] || ! "${VENV}/bin/python" -c 'import sys' >/dev/null 2>&1; then
    echo "Recreating Python virtual environment (missing or unusable)..."
    rm -rf "${VENV}"
    python3 -m venv "${VENV}"
  fi
  # shellcheck disable=SC1090
  source "${VENV}/bin/activate"
  if [ -f "${ROOT_DIR}/scripts/requirements.txt" ]; then
    "${VENV}/bin/python" -m pip install --no-cache-dir -r "${ROOT_DIR}/scripts/requirements.txt"
  fi
}

echo "=== Outliner Test Environment Setup ==="
echo "ROOT_DIR: ${ROOT_DIR}"

# In CI/self-hosted environments, always run full setup to ensure clean state
if ([ "${CI:-}" = "true" ] || [ -n "${GITHUB_ACTIONS:-}" ]) && [ "${PREINSTALLED_ENV:-}" != "true" ]; then
  echo "CI environment detected. RETRY_COUNT: $RETRY_COUNT"
  # Only remove sentinel to force full setup if this is the first run (RETRY_COUNT=0).
  if [ "$RETRY_COUNT" -eq 0 ]; then
     echo "Removing setup sentinel to ensure full setup..."
     rm -f "$SETUP_SENTINEL"
  fi
fi

# Bypass heavy setup steps if sentinel file exists
if [ -f "$SETUP_SENTINEL" ]; then
  echo "Setup already completed, skipping installation steps"
  SKIP_INSTALL=1
else
  SKIP_INSTALL=0
fi

# Note for env tests: keep tokens for discovery
# start_tinylicious (disabled on Yjs branch)
# start_api_server   (deprecated; handled by SvelteKit APIs)

# Install the repository-root devDependencies, which is where the dprint CLI and
# its wasm plugins live. dprint.json references the plugins out of node_modules/.
"${SCRIPT_DIR}/ensure-dprint-plugins.sh" || \
  echo "Warning: dprint plugins are unavailable; formatting will be skipped." >&2

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
# Remove functions/.env to prevent firebase-functions from failing to load it
# (in CI/test we use .env.test loaded via index.js)
rm -f "${ROOT_DIR}/functions/.env"

# Install required tools and dependencies on first run
if [ "$SKIP_INSTALL" -eq 0 ]; then
  echo "Installing global packages..."
  install_global_packages
  echo "Installing OS utilities..."
  install_os_utilities
  echo "Installing Python packages..."
  if apt_is_available; then
    retry_apt_get -y install python3-venv python3-pip
  else
    echo "Skipping python3-venv/python3-pip installation; using the interpreter already in the image."
  fi

  # Create Python virtual environment if it doesn't exist
  ensure_python_env

  # Install pre-commit via pip. The version floor matters: .pre-commit-config.yaml
  # declares its stages with the names introduced in 3.2 ("pre-commit" /
  # "pre-push"), which an older release rejects with InvalidConfigError before
  # running a single hook.
  if python3 -m pip install --no-cache-dir "pre-commit>=${PRE_COMMIT_MIN_VERSION}"; then
    if [ -d "${ROOT_DIR}/.git" ]; then
      pre-commit install --hook-type pre-commit || echo "Warning: Failed to install pre-commit hook"
    else
      echo "Skipping pre-commit install (not a git repository)"
    fi
  else
    echo "Warning: Failed to install pre-commit package"
  fi
  echo "Installing all dependencies..."
  install_all_dependencies

  # Build server (critical for artifacts)
  if [ "${SKIP_BUILD:-0}" -ne 1 ]; then
    echo "Building server..."
    cd "${ROOT_DIR}/server"
    npm run build
    echo "Server build complete. Artifacts in dist:"
    ls -la dist || echo "dist directory missing!"
    cd "${ROOT_DIR}"
  else
    echo "Skipping server build (SKIP_BUILD=1)"
  fi

  # Install Playwright browser (system dependencies should be handled by install_os_utilities)
  ensure_playwright_browsers

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
  if ! python3 -m pip --version >/dev/null 2>&1; then
    echo "pip missing; ensuring python3-pip is installed..."
    if apt_is_available; then
      retry_apt_get -y install python3-pip
    fi
  fi
  if [ ! -d "${ROOT_DIR}/client/node_modules" ] || [ ! -d "${ROOT_DIR}/scripts/tests/node_modules" ]; then
    install_all_dependencies
  fi
  # A cached setup can still be missing the browser (fresh container, pruned
  # cache). Skip the re-check only while a recorded fallback binary is valid.
  if [ ! -s "${ROOT_DIR}/.playwright-chromium-path" ] \
    || [ ! -x "$(head -n1 "${ROOT_DIR}/.playwright-chromium-path")" ]; then
    ensure_playwright_browsers
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

  # Ensure server is built if dist is missing or empty (critical for Yjs server)
  if [ ! -s "${ROOT_DIR}/server/dist/server/src/index.js" ]; then
    echo "Server build artifacts missing or empty. Building server..."
    cd "${ROOT_DIR}/server"
    npm_ci_if_needed
    npm run build
    if [ ! -s "dist/server/src/index.js" ]; then
        echo "Error: Server build failed to produce dist/server/src/index.js"
        ls -la dist || echo "dist directory not found"
        # ls -la dist/src || echo "dist/src directory not found"
        exit 1
    fi
    cd "${ROOT_DIR}"
  else
    echo "Server build artifacts found at ${ROOT_DIR}/server/dist/server/src/index.js"
    ls -l "${ROOT_DIR}/server/dist/server/src/index.js"
  fi
fi

# Runs on cached setups too: the sentinel skips the install block above, so a
# stale pre-commit older than the config would otherwise never be corrected.
echo "Checking pre-commit version..."
ensure_pre_commit_version
if [ -d "${ROOT_DIR}/.git" ]; then
  pre-commit install --hook-type pre-commit >/dev/null 2>&1 || true
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

echo "Verifying server artifacts before startup..."
ls -R "${ROOT_DIR}/server/dist" || echo "server/dist missing!"

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

# Robust port cleanup
cleanup_ports

# Kill existing firebase emulators running in background (not managed by PM2)
if pgrep -f "firebase.*emulators" > /dev/null; then
  echo "Stopping existing Firebase emulators..."
  pkill -f "firebase.*emulators" || true
fi

# Kill existing yjs-server running in background (might be left over)
if pgrep -f "node dist/server/src/index.js" > /dev/null; then
  echo "Stopping existing yjs-server..."
  pkill -f "node dist/server/src/index.js" || true
fi

sleep 3

# Start PM2-managed services and wait for readiness (shared with
# scripts/ci-e2e-start.sh; see start_and_wait_for_services in
# common-functions.sh).
start_and_wait_for_services
sleep 10

echo "Available services:"
echo "- SvelteKit Server: http://127.0.0.1:${VITE_PORT}"
echo "- API Server: (disabled; using SvelteKit APIs)"
echo "- Yjs WebSocket: ws://127.0.0.1:${TEST_YJS_PORT}"
echo "- Firebase Auth: http://127.0.0.1:${FIREBASE_AUTH_PORT}"
echo "- Firebase Firestore: http://127.0.0.1:${FIREBASE_FIRESTORE_PORT}"
echo "- Firebase Functions: http://127.0.0.1:${FIREBASE_FUNCTIONS_PORT}"
