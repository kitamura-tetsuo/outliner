#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SETUP_SENTINEL="${ROOT_DIR}/.codex-setup-installed"
set -euo pipefail

# Error handling
trap 'echo "Error occurred at line $LINENO. Exit code: $?" >&2' ERR

# Load common configuration and functions
source "${SCRIPT_DIR}/common-config.sh"
source "${SCRIPT_DIR}/common-functions.sh"

# Bypass heavy setup steps if sentinel file exists
if [ -f "$SETUP_SENTINEL" ]; then
  echo "Setup already completed, skipping installation steps"
  SKIP_INSTALL=1
else
  SKIP_INSTALL=0
fi

echo "=== Outliner Test Environment Setup ==="
echo "ROOT_DIR: ${ROOT_DIR}"

# Initialize environment
echo "Loading NVM..."
load_nvm
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
  echo "Installing all dependencies..."
  install_all_dependencies

  # Install Playwright browser (system dependencies should be handled by install_os_utilities)
  cd "${ROOT_DIR}/client"
  npx -y playwright install chromium
  cd "${ROOT_DIR}"

  # Ensure vitest and playwright packages are available for npm test
  if [ ! -f "${ROOT_DIR}/client/node_modules/.bin/vitest" ] || [ ! -f "${ROOT_DIR}/client/node_modules/.bin/playwright" ]; then
    echo "Installing vitest@3.2.4 and playwright@1.53.1 for testing..."
    cd "${ROOT_DIR}/client"
    npm --proxy='' --https-proxy='' install --no-save vitest@3.2.4 playwright@1.53.1
    cd "${ROOT_DIR}"
  fi
  touch "$SETUP_SENTINEL"
else
  echo "Skipping dependency installation"
  if [ ! -f "${ROOT_DIR}/client/node_modules/.bin/vitest" ] || [ ! -f "${ROOT_DIR}/client/node_modules/.bin/playwright" ]; then
    echo "Required test packages missing; installing vitest@3.2.4 and playwright@1.53.1..."
    cd "${ROOT_DIR}/client"
    npm --proxy='' --https-proxy='' install --no-save vitest@3.2.4 playwright@1.53.1
    cd "${ROOT_DIR}"
  fi
fi

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
  echo "Starting Tinylicious..."
  start_tinylicious
  echo "Starting API server..."
  start_api_server
  echo "Starting SvelteKit server..."
  start_sveltekit_server
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
echo "Available services:"
echo "- SvelteKit Server: http://localhost:${VITE_PORT}"
echo "- API Server: http://localhost:${TEST_API_PORT}"
echo "- Tinylicious: http://localhost:${TEST_FLUID_PORT}"
echo "- Firebase Auth: http://localhost:${FIREBASE_AUTH_PORT}"
echo "- Firebase Firestore: http://localhost:${FIREBASE_FIRESTORE_PORT}"
echo "- Firebase Functions: http://localhost:${FIREBASE_FUNCTIONS_PORT}"
