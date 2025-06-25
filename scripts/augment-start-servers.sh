#!/bin/bash
# Augment専用のテストサーバー起動スクリプト
# 他のスクリプトに影響を与えずに、Augmentでのテスト実行に必要なサーバーを起動します

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
set -euo pipefail

# Error handling
trap 'echo "Error occurred at line $LINENO. Exit code: $?" >&2' ERR

echo "=== Augment Test Servers Startup ==="
echo "ROOT_DIR: ${ROOT_DIR}"

# ポート設定
TEST_FLUID_PORT=7092
TEST_API_PORT=7091
VITE_PORT=7090
FIREBASE_AUTH_PORT=59099
FIREBASE_FIRESTORE_PORT=58080
FIREBASE_FUNCTIONS_PORT=57000
FIREBASE_HOSTING_PORT=57001
FIREBASE_PROJECT_ID=outliner-d57b0

# 環境変数設定
export NODE_ENV=test
export TEST_ENV=localhost
export FIREBASE_PROJECT_ID
export VITE_FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}

# ポートが使用中かチェック
check_port() {
    local port="$1"
    if lsof -i ":${port}" >/dev/null 2>&1; then
        return 0  # ポートが使用中
    else
        return 1  # ポートが空いている
    fi
}

# ポートの待機
wait_for_port() {
    local port="$1"
    local timeout="${2:-60}"
    local count=0
    
    echo "Waiting for port ${port}..."
    while [ $count -lt $timeout ]; do
        if nc -z localhost "${port}" >/dev/null 2>&1; then
            echo "Port ${port} is ready"
            return 0
        fi
        sleep 1
        count=$((count + 1))
        if [ $((count % 10)) -eq 0 ]; then
            echo "Still waiting for port ${port}... (${count}/${timeout})"
        fi
    done
    
    echo "Timeout waiting for port ${port}"
    return 1
}

# プロセス終了
kill_port_processes() {
    local ports=(${TEST_FLUID_PORT} ${TEST_API_PORT} ${VITE_PORT} ${FIREBASE_AUTH_PORT} ${FIREBASE_FIRESTORE_PORT} ${FIREBASE_FUNCTIONS_PORT} ${FIREBASE_HOSTING_PORT})
    
    echo "Stopping existing processes..."
    for port in "${ports[@]}"; do
        if check_port ${port}; then
            echo "Killing process on port ${port}..."
            lsof -ti ":${port}" | xargs kill -9 2>/dev/null || true
            sleep 1
        fi
    done
}

# Firebase emulator起動
start_firebase_emulator() {
    echo "Starting Firebase emulator..."
    cd "${ROOT_DIR}"
    
    # Augment専用の設定ファイルを使用
    firebase emulators:start --config firebase.augment.json --project ${FIREBASE_PROJECT_ID} > "${ROOT_DIR}/server/logs/firebase-emulator.log" 2>&1 &
    local firebase_pid=$!
    echo "Firebase emulator started with PID: ${firebase_pid}"
    
    # Firebase emulatorの起動を待機
    sleep 5
    if ! wait_for_port ${FIREBASE_AUTH_PORT} 30; then
        echo "Warning: Firebase Auth emulator may not be ready"
    fi
    if ! wait_for_port ${FIREBASE_FIRESTORE_PORT} 30; then
        echo "Warning: Firebase Firestore emulator may not be ready"
    fi
    if ! wait_for_port ${FIREBASE_FUNCTIONS_PORT} 30; then
        echo "Warning: Firebase Functions emulator may not be ready"
    fi
}

# Tinylicious起動
start_tinylicious() {
    echo "Starting Tinylicious server on port ${TEST_FLUID_PORT}..."
    cd "${ROOT_DIR}/client"
    PORT=${TEST_FLUID_PORT} npx tinylicious > "${ROOT_DIR}/server/logs/tinylicious.log" 2>&1 &
    local tinylicious_pid=$!
    echo "Tinylicious started with PID: ${tinylicious_pid}"
    cd "${ROOT_DIR}"
    
    if ! wait_for_port ${TEST_FLUID_PORT} 30; then
        echo "Warning: Tinylicious may not be ready"
    fi
}

# API server起動
start_api_server() {
    echo "Starting API server on port ${TEST_API_PORT}..."
    cd "${ROOT_DIR}/server"
    
    # 環境ファイルの確認
    if [ ! -f ".env.test" ]; then
        echo "Warning: .env.test not found, creating basic one..."
        cat > .env.test << EOF
NODE_ENV=test
PORT=${TEST_API_PORT}
FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}
VITE_FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}
EOF
    fi
    
    npx dotenvx run --env-file=.env.test -- npm run dev -- --host 0.0.0.0 --port ${TEST_API_PORT} > "${ROOT_DIR}/server/logs/test-auth-service.log" 2>&1 &
    local api_pid=$!
    echo "API server started with PID: ${api_pid}"
    cd "${ROOT_DIR}"
    
    if ! wait_for_port ${TEST_API_PORT} 30; then
        echo "Warning: API server may not be ready"
    fi
}

# SvelteKit server起動
start_sveltekit_server() {
    echo "Starting SvelteKit server on port ${VITE_PORT}..."
    cd "${ROOT_DIR}/client"
    
    # 環境ファイルの確認
    if [ ! -f ".env.test" ]; then
        echo "Warning: .env.test not found, creating basic one..."
        cat > .env.test << EOF
NODE_ENV=test
VITE_PORT=${VITE_PORT}
VITE_FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}
VITE_USE_FIREBASE_EMULATOR=true
VITE_FIREBASE_EMULATOR_HOST=localhost
VITE_FIRESTORE_EMULATOR_PORT=${FIREBASE_FIRESTORE_PORT}
VITE_AUTH_EMULATOR_PORT=${FIREBASE_AUTH_PORT}
EOF
    fi
    
    npx dotenvx run --env-file=.env.test -- npm run dev -- --host 0.0.0.0 --port ${VITE_PORT} > "${ROOT_DIR}/server/logs/test-svelte-kit.log" 2>&1 &
    local svelte_pid=$!
    echo "SvelteKit server started with PID: ${svelte_pid}"
    cd "${ROOT_DIR}"
    
    if ! wait_for_port ${VITE_PORT} 30; then
        echo "Warning: SvelteKit server may not be ready"
    fi
}

# サーバー状態確認
check_servers() {
    echo ""
    echo "=== Server Status ==="
    local services=(
        "SvelteKit:${VITE_PORT}"
        "API:${TEST_API_PORT}"
        "Tinylicious:${TEST_FLUID_PORT}"
        "Firebase Auth:${FIREBASE_AUTH_PORT}"
        "Firebase Firestore:${FIREBASE_FIRESTORE_PORT}"
        "Firebase Functions:${FIREBASE_FUNCTIONS_PORT}"
    )
    
    for service in "${services[@]}"; do
        local name="${service%:*}"
        local port="${service#*:}"
        if nc -z localhost "${port}" >/dev/null 2>&1; then
            echo "✓ ${name} (port ${port}) - Running"
        else
            echo "✗ ${name} (port ${port}) - Not responding"
        fi
    done
}

# メイン実行
main() {
    # 既存プロセスの停止
    kill_port_processes
    sleep 2
    
    # ログディレクトリの作成
    mkdir -p "${ROOT_DIR}/server/logs"
    
    # サーバーの起動
    start_firebase_emulator
    sleep 3
    start_tinylicious
    sleep 2
    start_api_server
    sleep 2
    start_sveltekit_server
    sleep 3
    
    # 状態確認
    check_servers
    
    echo ""
    echo "=== Augment Test Servers Started ==="
    echo "Available services:"
    echo "- SvelteKit Server: http://localhost:${VITE_PORT}"
    echo "- API Server: http://localhost:${TEST_API_PORT}"
    echo "- Tinylicious: http://localhost:${TEST_FLUID_PORT}"
    echo "- Firebase Auth: http://localhost:${FIREBASE_AUTH_PORT}"
    echo "- Firebase Firestore: http://localhost:${FIREBASE_FIRESTORE_PORT}"
    echo "- Firebase Functions: http://localhost:${FIREBASE_FUNCTIONS_PORT}"
    echo ""
    echo "To run tests:"
    echo "  cd client && npx playwright test"
    echo "  npm test (for unit tests)"
    echo ""
    echo "To stop all servers:"
    echo "  scripts/augment-stop-servers.sh"
}

# スクリプトが直接実行された場合のみmainを実行
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
