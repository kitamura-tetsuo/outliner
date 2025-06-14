#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
set -euo pipefail

wait_for_port() {
  local port="$1"
  local retry=30
  echo "Waiting for port ${port}..."
  while ! (nc -z localhost "${port}" >/dev/null 2>&1 || nc -z 127.0.0.1 "${port}" >/dev/null 2>&1); do
    echo "Port ${port} not ready yet, retrying... (${retry} attempts left)"
    sleep 2
    retry=$((retry-1))
    if [ ${retry} -le 0 ]; then
      echo "Timeout waiting for port ${port}"
      echo "Checking if process is still running..."
      local port_check=$(netstat -tulpn | grep ":${port}")
      if [ -n "$port_check" ]; then
        echo "Port ${port} is listening:"
        echo "$port_check"
        echo "Port ${port} is listening, considering it ready"
        return 0
      else
        echo "No process found on port ${port}"
        return 1
      fi
    fi
  done
  echo "Port ${port} is ready"
}

# ポート番号のデフォルト値
: "${TEST_FLUID_PORT:=7095}"
: "${TEST_API_PORT:=7094}"
: "${VITE_PORT:=7093}"

chmod +x ${ROOT_DIR}/scripts/setup-local-env.sh
${ROOT_DIR}/scripts/setup-local-env.sh

set -a
source ${ROOT_DIR}/server/.env
source ${ROOT_DIR}/client/.env
set +a


# Install necessary global packages and tools
npm install -g firebase-tools tinylicious dotenv-cli cross-env @dotenvx/dotenvx || true
curl -fsSL https://dprint.dev/install.sh | sh
if ! command -v cross-env >/dev/null; then
  echo "cross-env not found after global install; attempting local install"
  npm install -g cross-env
fi

pwd
echo "ROOT_DIR: ${ROOT_DIR}"

cd ${ROOT_DIR}

mkdir -p ${ROOT_DIR}/logs/
mkdir -p client/logs/
mkdir -p client/e2e/logs/
mkdir -p server/logs/
mkdir -p functions/logs/
    # サーバーサイドの準備
cd ${ROOT_DIR}/server
rm -rf node_modules || true
npm ci
    # Firebase Functionsの準備
cd ${ROOT_DIR}/functions
rm -rf node_modules || true
npm ci
    # クライアントの準備
cd ${ROOT_DIR}/client
rm -rf node_modules || true
npm ci
npx -y @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
npx -y playwright install --with-deps chromium

# Ensure required OS utilities are available
sudo apt-get update
DEBIAN_FRONTEND=noninteractive sudo apt-get -y install --no-install-recommends \
  lsof xvfb > /dev/null

chmod +x ${ROOT_DIR}/scripts/kill_ports.sh
${ROOT_DIR}/scripts/kill_ports.sh || true

echo "Starting services..."

    # Tinyliciousサーバーの起動
echo "Starting Tinylicious on port ${TEST_FLUID_PORT}..."
cd ${ROOT_DIR}
PORT=${TEST_FLUID_PORT} tinylicious > ${ROOT_DIR}/logs/tinylicious.log 2>&1 &
TINYLICIOUS_PID=$!
echo "Tinylicious started with PID: $TINYLICIOUS_PID"
sleep 2

    # Firebase Emulatorの起動
echo "Starting Firebase Emulator..."
cd ${ROOT_DIR}
if [ -d "firebase" ]; then
    cd ${ROOT_DIR}/firebase
    firebase emulators:start --project demo-test > ${ROOT_DIR}/logs/firebase-emulator.log 2>&1 &
    FIREBASE_PID=$!
    echo "Firebase Emulator started with PID: $FIREBASE_PID"
    sleep 3
else
    echo "Firebase directory not found, skipping Firebase Emulator"
fi

    # APIサーバーの起動
echo "Starting API server on port ${TEST_API_PORT}..."
cd ${ROOT_DIR}/server
npm run dev -- --host 0.0.0.0 --port=${TEST_API_PORT} > ${ROOT_DIR}/logs/auth-service-tee.log 2>&1 &
API_PID=$!
echo "API server started with PID: $API_PID"
sleep 3

    # SvelteKitサーバーの起動
echo "Starting SvelteKit server on port ${VITE_PORT}..."
cd ${ROOT_DIR}/client
npm run dev -- --host 0.0.0.0 --port=${VITE_PORT} > ${ROOT_DIR}/logs/svelte-kit.log 2>&1 &
SVELTE_PID=$!
echo "SvelteKit server started with PID: $SVELTE_PID"
sleep 3

echo "Waiting for services to start..."
wait_for_port ${TEST_FLUID_PORT}
wait_for_port ${TEST_API_PORT}
wait_for_port ${VITE_PORT}

echo "All services are ready!"
echo "Tinylicious: http://localhost:${TEST_FLUID_PORT}"
echo "API Server: http://localhost:${TEST_API_PORT}"
echo "SvelteKit: http://localhost:${VITE_PORT}"
