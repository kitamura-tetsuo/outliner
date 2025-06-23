#!/bin/bash
# Augment専用のテストサーバー停止スクリプト

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Augment Test Servers Shutdown ==="

# ポート設定
TEST_FLUID_PORT=7092
TEST_API_PORT=7091
VITE_PORT=7090
FIREBASE_AUTH_PORT=59099
FIREBASE_FIRESTORE_PORT=58080
FIREBASE_FUNCTIONS_PORT=57000
FIREBASE_HOSTING_PORT=57001

# プロセス終了
kill_port_processes() {
    local ports=(${TEST_FLUID_PORT} ${TEST_API_PORT} ${VITE_PORT} ${FIREBASE_AUTH_PORT} ${FIREBASE_FIRESTORE_PORT} ${FIREBASE_FUNCTIONS_PORT} ${FIREBASE_HOSTING_PORT})
    
    echo "Stopping test servers..."
    for port in "${ports[@]}"; do
        if lsof -i ":${port}" >/dev/null 2>&1; then
            echo "Killing process on port ${port}..."
            lsof -ti ":${port}" | xargs kill -9 2>/dev/null || true
            sleep 1
        else
            echo "No process found on port ${port}"
        fi
    done
}

# Firebase emulator停止
stop_firebase_emulator() {
    echo "Stopping Firebase emulator..."
    cd "${ROOT_DIR}"
    firebase emulators:stop 2>/dev/null || true
    
    # プロセスが残っている場合は強制終了
    pkill -f "firebase.*emulator" 2>/dev/null || true
    pkill -f "java.*firebase" 2>/dev/null || true
}

# メイン実行
main() {
    stop_firebase_emulator
    kill_port_processes
    
    echo ""
    echo "=== All test servers stopped ==="
}

# スクリプトが直接実行された場合のみmainを実行
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
