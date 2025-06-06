#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
set -euo pipefail

# ポート番号のデフォルト値
: "${TEST_FLUID_PORT:=7092}"
: "${TEST_API_PORT:=7091}"
: "${VITE_PORT:=7090}"

chmod +x ${ROOT_DIR}/scripts/setup-local-env.sh
${ROOT_DIR}/scripts/setup-local-env.sh

set -a
source ${ROOT_DIR}/server/.env
source ${ROOT_DIR}/client/.env
set +a


# Install necessary global packages and tools
npm install -g firebase-tools tinylicious dotenv-cli cross-env || true
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
npm ci
    # Firebase Functionsの準備
cd ${ROOT_DIR}/functions
npm ci
    # クライアントの準備
cd ${ROOT_DIR}/client
npm ci
npx -y playwright install --with-deps chromium

chmod +x ${ROOT_DIR}/scripts/kill_ports.sh
${ROOT_DIR}/scripts/kill_ports.sh


    # Tinyliciousサーバーの起動
PORT=${TEST_FLUID_PORT} tinylicious > ${ROOT_DIR}/logs/tinylicious.log 2>&1 &

    # Firebase Emulatorの起動
cd ${ROOT_DIR}/firebase
firebase emulators:start --project demo-test > ${ROOT_DIR}/logs/firebase-emulator.log 2>&1 &

    # APIサーバーの起動
cd ${ROOT_DIR}/server
npm run dev -- --host 0.0.0.0 --port ${TEST_API_PORT} > ${ROOT_DIR}/logs/auth-service-tee.log 2>&1 &

    # クライアントの準備
cd ${ROOT_DIR}/client
    # SvelteKitサーバーの起動
npm run dev -- --host 0.0.0.0 --port ${VITE_PORT} > ${ROOT_DIR}/logs/svelte-kit.log 2>&1 &
