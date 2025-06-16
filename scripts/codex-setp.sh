#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
set -euo pipefail

# Error handling
trap 'echo "Error occurred at line $LINENO. Exit code: $?" >&2' ERR

# Load common configuration and functions
source "${SCRIPT_DIR}/common-config.sh"
source "${SCRIPT_DIR}/common-functions.sh"

echo "=== Outliner Test Environment Setup ==="
echo "ROOT_DIR: ${ROOT_DIR}"

# Initialize environment
echo "Loading NVM..."
load_nvm
echo "Creating log directories..."
create_log_directories
echo "Setting up environment files..."
setup_environment_files

# Install required tools and dependencies
echo "Installing global packages..."
install_global_packages
echo "Installing OS utilities..."
install_os_utilities
echo "Installing all dependencies..."
install_all_dependencies

# Install Playwright with dependencies
cd "${ROOT_DIR}/client"
npx -y playwright install --with-deps chromium
cd "${ROOT_DIR}"

# Stop any existing servers to ensure clean restart
echo "Stopping any existing servers..."
kill_ports || echo "Warning: Some ports could not be killed"
sleep 2

# Start all test servers
echo "Starting test servers..."
echo "Starting Firebase emulator..."
start_firebase_emulator
echo "Starting Tinylicious..."
start_tinylicious
echo "Starting API server..."
start_api_server
echo "Starting SvelteKit server..."
start_sveltekit_server

# Wait for all services to be ready
echo "Waiting for all services to be ready..."
if wait_for_all_ports; then
  echo "=== All test services are ready! ==="
else
  echo "=== Test environment setup completed with warnings ==="
  echo "Some services may not be fully ready, but the environment is usable"
fi

echo "Available services:"
echo "- SvelteKit Server: http://localhost:${VITE_PORT}"
echo "- API Server: http://localhost:${TEST_API_PORT}"
echo "- Tinylicious: http://localhost:${TEST_FLUID_PORT}"
echo "- Firebase Auth: http://localhost:${FIREBASE_AUTH_PORT}"
echo "- Firebase Firestore: http://localhost:${FIREBASE_FIRESTORE_PORT}"
echo "- Firebase Functions: http://localhost:${FIREBASE_FUNCTIONS_PORT}"
