#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load common configuration and functions
source "${SCRIPT_DIR}/common-config.sh"
source "${SCRIPT_DIR}/common-functions.sh"

echo "=== Starting all Localhost servers ==="

# Initialize environment
load_nvm
create_log_directories
setup_environment_files

# Install required tools and dependencies
install_global_packages
install_all_dependencies

# Stop any existing servers to ensure clean restart
echo "Stopping any existing servers..."
kill_ports
sleep 2

# Start all servers
echo "Starting all servers..."
start_firebase_emulator &
FIREBASE_PID=$!

start_yjs_server &
YJS_PID=$!

start_api_server &
API_SERVER_PID=$!

start_sveltekit_server &
SVELTEKIT_PID=$!

echo "All servers started!"
echo "Firebase Functions PID: $FIREBASE_PID"
echo "Yjs Server PID: $YJS_PID"
echo "API Server PID: $API_SERVER_PID"
echo "SvelteKit Server PID: $SVELTEKIT_PID"

echo ""
echo "Waiting for all services to be ready..."
wait_for_all_ports

echo ""
echo "All servers are running on:"
echo "- SvelteKit Server: http://localhost:${VITE_PORT}"
echo "- API Server: http://localhost:${TEST_API_PORT}"
echo "- Yjs WebSocket: ws://localhost:${TEST_YJS_PORT}"
echo "- Firebase Auth: http://localhost:${FIREBASE_AUTH_PORT}"
echo "- Firebase Firestore: http://localhost:${FIREBASE_FIRESTORE_PORT}"
echo "- Firebase Functions: http://localhost:${FIREBASE_FUNCTIONS_PORT}"

echo ""
echo "Press Ctrl+C to stop all servers"

# シグナルハンドラーを設定してすべてのプロセスを終了
trap 'echo "Stopping all servers..."; kill $FIREBASE_PID $YJS_PID $API_SERVER_PID $SVELTEKIT_PID 2>/dev/null; kill_ports; exit' INT TERM

# すべてのプロセスが終了するまで待機
wait
