#!/bin/bash
# Augment専用のテスト実行スクリプト
# 環境セットアップからテスト実行まで一括で行います

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
set -euo pipefail

echo "=== Augment Test Runner ==="
echo "ROOT_DIR: ${ROOT_DIR}"

# 使用方法の表示
show_usage() {
    echo "Usage: $0 [OPTIONS] [TEST_PATTERN]"
    echo ""
    echo "Options:"
    echo "  --setup-only     Only setup environment, don't run tests"
    echo "  --servers-only   Only start servers, don't run tests"
    echo "  --tests-only     Only run tests (assume environment is ready)"
    echo "  --unit           Run unit tests only"
    echo "  --e2e            Run E2E tests only"
    echo "  --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                           # Full setup and run all tests"
    echo "  $0 --setup-only              # Setup environment only"
    echo "  $0 --tests-only              # Run tests only"
    echo "  $0 --e2e CLM-0103            # Run specific E2E test"
    echo "  $0 --unit                    # Run unit tests only"
}

# 引数解析
SETUP_ONLY=false
SERVERS_ONLY=false
TESTS_ONLY=false
UNIT_ONLY=false
E2E_ONLY=false
TEST_PATTERN=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --setup-only)
            SETUP_ONLY=true
            shift
            ;;
        --servers-only)
            SERVERS_ONLY=true
            shift
            ;;
        --tests-only)
            TESTS_ONLY=true
            shift
            ;;
        --unit)
            UNIT_ONLY=true
            shift
            ;;
        --e2e)
            E2E_ONLY=true
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            TEST_PATTERN="$1"
            shift
            ;;
    esac
done

# 環境セットアップ
setup_environment() {
    echo "=== Setting up test environment ==="
    "${SCRIPT_DIR}/augment-setup.sh"
}

# サーバー起動
start_servers() {
    echo "=== Starting test servers ==="
    "${SCRIPT_DIR}/augment-start-servers.sh"
}

# ユニットテスト実行
run_unit_tests() {
    echo "=== Running unit tests ==="
    cd "${ROOT_DIR}"
    
    # Server unit tests
    if [ -f "server/package.json" ] && grep -q '"test"' server/package.json; then
        echo "Running server unit tests..."
        cd server
        npm test || echo "Server tests failed"
        cd "${ROOT_DIR}"
    fi
    
    # Client unit tests
    if [ -f "client/package.json" ] && grep -q '"test:unit"' client/package.json; then
        echo "Running client unit tests..."
        cd client
        npm run test:unit || echo "Client unit tests failed"
        cd "${ROOT_DIR}"
    fi
}

# E2Eテスト実行
run_e2e_tests() {
    echo "=== Running E2E tests ==="
    cd "${ROOT_DIR}/client"
    
    # テストパターンが指定されている場合
    if [ -n "$TEST_PATTERN" ]; then
        echo "Running E2E tests matching pattern: $TEST_PATTERN"
        npx playwright test --grep "$TEST_PATTERN" || echo "E2E tests failed"
    else
        echo "Running all E2E tests..."
        npx playwright test || echo "E2E tests failed"
    fi
    
    cd "${ROOT_DIR}"
}

# サーバー状態確認
check_servers() {
    echo "=== Checking server status ==="
    local ports=(7090 7091 7092 59099 58080 57000)
    local all_ready=true
    
    for port in "${ports[@]}"; do
        if nc -z localhost "${port}" >/dev/null 2>&1; then
            echo "✓ Port ${port} - Ready"
        else
            echo "✗ Port ${port} - Not ready"
            all_ready=false
        fi
    done
    
    if [ "$all_ready" = false ]; then
        echo "Warning: Some servers are not ready. Tests may fail."
        return 1
    fi
    
    return 0
}

# メイン実行
main() {
    # セットアップのみの場合
    if [ "$SETUP_ONLY" = true ]; then
        setup_environment
        echo "Environment setup complete."
        return 0
    fi
    
    # サーバー起動のみの場合
    if [ "$SERVERS_ONLY" = true ]; then
        start_servers
        echo "Servers started."
        return 0
    fi
    
    # テストのみの場合
    if [ "$TESTS_ONLY" = false ]; then
        setup_environment
        start_servers
        
        # サーバーの準備完了を待機
        echo "Waiting for servers to be ready..."
        sleep 10
        if ! check_servers; then
            echo "Warning: Proceeding with tests despite server issues..."
        fi
    fi
    
    # テスト実行
    if [ "$UNIT_ONLY" = true ]; then
        run_unit_tests
    elif [ "$E2E_ONLY" = true ]; then
        run_e2e_tests
    else
        # 両方実行
        run_unit_tests
        run_e2e_tests
    fi
    
    echo ""
    echo "=== Test execution complete ==="
    echo "Check the logs in server/logs/ for detailed information"
}

# エラーハンドリング
trap 'echo "Error occurred at line $LINENO. Exit code: $?" >&2' ERR

# スクリプトが直接実行された場合のみmainを実行
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
