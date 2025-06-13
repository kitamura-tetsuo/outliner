#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
set -euo pipefail

wait_for_port() {
  local port="$1"
  local retry=60
  echo "Waiting for port ${port}..."
  while ! nc -z localhost "${port}" >/dev/null 2>&1; do
    sleep 1
    retry=$((retry-1))
    if [ ${retry} -le 0 ]; then
      echo "Timeout waiting for port ${port}"
      exit 1
    fi
  done
  echo "Port ${port} is ready"
}

# ポート番号のデフォルト値
: "${TEST_FLUID_PORT:=7092}"
: "${TEST_API_PORT:=7091}"
: "${VITE_PORT:=7090}"
: "${FIREBASE_PROJECT_ID:=outliner-d57b0}"

chmod +x ${ROOT_DIR}/scripts/setup-local-env.sh
${ROOT_DIR}/scripts/setup-local-env.sh

set -a
source ${ROOT_DIR}/server/.env
source ${ROOT_DIR}/client/.env
if [ -f ${ROOT_DIR}/client/.env.test ]; then
  source ${ROOT_DIR}/client/.env.test
fi
export NODE_ENV=test
export TEST_ENV=localhost
set +a

FIREBASE_PROJECT_ID="outliner-d57b0"
export FIREBASE_PROJECT_ID
export VITE_FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}

# Skip Paraglide compile in tests
: "${SKIP_PARAGLIDE_COMPILE:=1}"


# Install necessary global packages and tools
if ! command -v firebase >/dev/null || ! command -v tinylicious >/dev/null; then
  npm --proxy='' --https-proxy='' install -g firebase-tools tinylicious dotenv-cli cross-env @dotenvx/dotenvx || true
fi

if ! command -v dprint >/dev/null; then
  curl -fsSL https://dprint.dev/install.sh | sh
fi
if ! command -v cross-env >/dev/null; then
  echo "cross-env not found after global install; attempting local install"
  npm install -g cross-env || true
fi

pwd
echo "ROOT_DIR: ${ROOT_DIR}"

cd ${ROOT_DIR}

mkdir -p ${ROOT_DIR}/logs/
mkdir -p client/logs/
mkdir -p client/e2e/logs/
mkdir -p server/logs/
mkdir -p functions/logs/
npm_ci_if_needed() {
  if [ ! -d node_modules ]; then
    npm --proxy='' --https-proxy='' ci
  fi
}

    # サーバーサイドの準備
cd ${ROOT_DIR}/server
npm_ci_if_needed
    # Firebase Functionsの準備
cd ${ROOT_DIR}/functions
npm_ci_if_needed
    # クライアントの準備
cd ${ROOT_DIR}/client
npm_ci_if_needed
if [ -z "${SKIP_PARAGLIDE_COMPILE}" ] && [ -d node_modules ]; then
  npx -y @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide || true
fi

# Ensure required OS utilities are available before installing Playwright to
# avoid apt lock conflicts when using --with-deps
if ! command -v lsof >/dev/null || ! command -v xvfb-run >/dev/null; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get -y install --no-install-recommends \
    lsof xvfb > /dev/null
fi

npx -y playwright install --with-deps chromium

chmod +x ${ROOT_DIR}/scripts/kill_ports.sh
${ROOT_DIR}/scripts/kill_ports.sh || true
# Ensure Firebase emulator ports are free
lsof -ti :59099 2>/dev/null | xargs -r kill -9 || true
lsof -ti :58080 2>/dev/null | xargs -r kill -9 || true
lsof -ti :57000 2>/dev/null | xargs -r kill -9 || true
lsof -ti :4400 2>/dev/null | xargs -r kill -9 || true


    # Tinyliciousサーバーの起動
PORT=${TEST_FLUID_PORT} tinylicious > ${ROOT_DIR}/logs/tinylicious.log 2>&1 &

    # Firebase Emulatorの起動
cd ${ROOT_DIR}/firebase
firebase emulators:start --project ${FIREBASE_PROJECT_ID} > ${ROOT_DIR}/logs/firebase-emulator.log 2>&1 &

    # APIサーバーの起動
cd ${ROOT_DIR}/server
npm run dev -- --host 0.0.0.0 --port ${TEST_API_PORT} > ${ROOT_DIR}/logs/auth-service-tee.log 2>&1 &

    # クライアントの準備
cd ${ROOT_DIR}/client
    # SvelteKitサーバーの起動 (test mode)
cross-env NODE_ENV=test TEST_ENV=localhost \
  dotenvx run --env-file=${ROOT_DIR}/client/.env.test -- \
  npm run dev -- --host 0.0.0.0 --port ${VITE_PORT} \
  > ${ROOT_DIR}/logs/svelte-kit.log 2>&1 &

wait_for_port ${TEST_API_PORT}
wait_for_port ${TEST_FLUID_PORT}
wait_for_port ${VITE_PORT}
wait_for_port 57000
wait_for_port 59099
wait_for_port 58080
