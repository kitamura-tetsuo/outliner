#!/bin/bash

# 包括的なFluid vs Yjs比較テストスクリプト
# 1. Fluid用サーバー起動 (codex-setup.sh)
# 2. Fluid版全テスト実行
# 3. Yjs用サーバー起動 (codex-setup.sh)
# 4. Yjs版全テスト実行
# 5. スナップショット比較

set -e

# 色付きログ関数
log_info() {
    echo -e "\033[34m[INFO]\033[0m $1"
}

log_success() {
    echo -e "\033[32m[SUCCESS]\033[0m $1"
}

log_warning() {
    echo -e "\033[33m[WARNING]\033[0m $1"
}

log_error() {
    echo -e "\033[31m[ERROR]\033[0m $1"
}

log_section() {
    echo ""
    echo -e "\033[35m=== $1 ===\033[0m"
    echo ""
}

# 設定
OUTLINER_YJS_DIR="/home/ubuntu/src2/outliner"
OUTLINER_FLUID_DIR="/home/ubuntu/src2/outliner-fluid"
CURRENT_DIR=$(pwd)
TEST_TIMEOUT=300  # 5分
SERVER_STARTUP_WAIT=30  # 30秒

# 引数の処理
SKIP_SETUP=false
SKIP_TESTS=false
COMPARE_ONLY=false
VERBOSE=false
FLUID_ONLY=false
YJS_ONLY=false

# テスト失敗追跡
TEST_FAILURES=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-setup)
            SKIP_SETUP=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --compare-only)
            COMPARE_ONLY=true
            SKIP_SETUP=true
            SKIP_TESTS=true
            shift
            ;;
        --fluid-only)
            FLUID_ONLY=true
            shift
            ;;
        --yjs-only)
            YJS_ONLY=true
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --skip-setup      セットアップをスキップ"
            echo "  --skip-tests      テスト実行をスキップ"
            echo "  --compare-only    既存のスナップショットのみを比較"
            echo "  --fluid-only      Fluidブランチのみでテスト実行"
            echo "  --yjs-only        Yjsブランチのみでテスト実行"
            echo "  --verbose, -v     詳細ログを表示"
            echo "  --help, -h        このヘルプを表示"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# 関数: プロセスを安全に停止
cleanup_processes() {
    log_info "Cleaning up background processes..."
    
    # Node.jsプロセスを停止
    pkill -f "vite dev" || true
    pkill -f "npm run dev" || true
    pkill -f "node.*vite" || true
    
    # Firebase emulatorを停止
    pkill -f "firebase-tools" || true
    pkill -f "java.*firebase" || true
    
    # ポート7090を使用しているプロセスを停止
    lsof -ti:7090 | xargs kill -9 2>/dev/null || true
    
    sleep 3
}

# 関数: サーバーセットアップと起動
setup_and_start_server() {
    local branch_name=$1
    local branch_dir=$2
    
    log_section "Setting up $branch_name server"
    
    cd "$branch_dir"
    
    if [ "$SKIP_SETUP" = false ]; then
        log_info "Running codex-setup.sh for $branch_name..."
        if [ "$VERBOSE" = true ]; then
            bash scripts/codex-setup.sh
        else
            bash scripts/codex-setup.sh > /dev/null 2>&1
        fi
        log_success "Setup completed for $branch_name"
    else
        log_info "Skipping setup for $branch_name"
    fi
    
    # クライアントディレクトリに移動
    cd "$branch_dir/client"
    
    # 依存関係のインストール確認
    if [ ! -d "node_modules" ]; then
        log_info "Installing dependencies for $branch_name..."
        npm install
    fi
    
    log_info "Starting development server for $branch_name..."
    npm run dev -- --port 7090 --host 0.0.0.0 > /dev/null 2>&1 &
    SERVER_PID=$!
    
    log_info "Waiting ${SERVER_STARTUP_WAIT}s for server to start..."
    sleep $SERVER_STARTUP_WAIT
    
    # サーバーが起動しているか確認
    if curl -s http://localhost:7090/ > /dev/null; then
        log_success "$branch_name server is running on port 7090"
    else
        log_error "$branch_name server failed to start"
        return 1
    fi
    
    cd "$CURRENT_DIR"
}

# 関数: テスト実行
run_tests() {
    local branch_name=$1
    local branch_dir=$2
    
    log_section "Running tests for $branch_name"
    
    cd "$branch_dir/client"
    
    # 既存のスナップショットをクリア
    log_info "Clearing existing snapshots for $branch_name..."
    rm -rf e2e-snapshots/*.json 2>/dev/null || true
    
    # 基本テストを実行
    log_info "Running basic tests for $branch_name..."
    if [ "$VERBOSE" = true ]; then
        if ! timeout $TEST_TIMEOUT npm run test:e2e; then
            log_warning "Some tests failed for $branch_name, but continuing..."
            TEST_FAILURES=true
        fi
    else
        if ! timeout $TEST_TIMEOUT npm run test:e2e > /dev/null 2>&1; then
            log_warning "Some tests failed for $branch_name, but continuing..."
            TEST_FAILURES=true
        fi
    fi

    # スナップショットテストを実行
    log_info "Running snapshot tests for $branch_name..."
    if [ "$VERBOSE" = true ]; then
        if ! timeout $TEST_TIMEOUT npx playwright test --project=basic --grep "snapshot" --timeout=60000; then
            log_warning "Snapshot tests failed for $branch_name, but continuing..."
            TEST_FAILURES=true
        fi
    else
        if ! timeout $TEST_TIMEOUT npx playwright test --project=basic --grep "snapshot" --timeout=60000 > /dev/null 2>&1; then
            log_warning "Snapshot tests failed for $branch_name, but continuing..."
            TEST_FAILURES=true
        fi
    fi
    
    # 生成されたスナップショットを確認
    local snapshot_count=$(ls e2e-snapshots/*.json 2>/dev/null | wc -l || echo "0")
    log_info "Generated $snapshot_count snapshot files for $branch_name"
    
    cd "$CURRENT_DIR"
}

# 関数: スナップショット比較
compare_snapshots() {
    log_section "Comparing snapshots"
    
    # FluidブランチのスナップショットをYjsブランチにコピー
    log_info "Copying Fluid snapshots to Yjs branch for comparison..."
    mkdir -p "$OUTLINER_YJS_DIR/client/e2e-snapshots"
    cp "$OUTLINER_FLUID_DIR/client/e2e-snapshots"/*-fluid.json "$OUTLINER_YJS_DIR/client/e2e-snapshots/" 2>/dev/null || true
    
    # Yjsブランチで比較を実行
    cd "$OUTLINER_YJS_DIR/client"
    
    log_info "Running snapshot comparison..."
    if npx tsx scripts/compareSnapshots.ts; then
        log_success "All snapshots match perfectly!"
        return 0
    else
        log_error "Some snapshots do not match."
        return 1
    fi
}

# メイン処理
main() {
    log_section "Starting Full Fluid vs Yjs Comparison Test"
    
    # 初期クリーンアップ
    cleanup_processes
    
    # ディレクトリの存在確認
    if [ ! -d "$OUTLINER_YJS_DIR" ]; then
        log_error "Yjs branch directory not found: $OUTLINER_YJS_DIR"
        exit 1
    fi
    
    if [ ! -d "$OUTLINER_FLUID_DIR" ]; then
        log_error "Fluid branch directory not found: $OUTLINER_FLUID_DIR"
        exit 1
    fi
    
    # 比較のみの場合
    if [ "$COMPARE_ONLY" = true ]; then
        compare_snapshots
        exit $?
    fi

    # オプションの競合チェック
    if [ "$FLUID_ONLY" = true ] && [ "$YJS_ONLY" = true ]; then
        log_error "Cannot specify both --fluid-only and --yjs-only options"
        exit 1
    fi

    # テスト実行
    if [ "$SKIP_TESTS" = false ]; then
        # Fluidブランチのテスト
        if [ "$YJS_ONLY" = false ]; then
            setup_and_start_server "Fluid" "$OUTLINER_FLUID_DIR"
            run_tests "Fluid" "$OUTLINER_FLUID_DIR"
            cleanup_processes
        fi

        # Yjsブランチのテスト
        if [ "$FLUID_ONLY" = false ]; then
            setup_and_start_server "Yjs" "$OUTLINER_YJS_DIR"
            run_tests "Yjs" "$OUTLINER_YJS_DIR"
            cleanup_processes
        fi
    fi
    
    # 最終結果の判定
    local final_exit_code=0

    # スナップショット比較（両ブランチでテストが実行された場合のみ）
    if [ "$FLUID_ONLY" = false ] && [ "$YJS_ONLY" = false ]; then
        if compare_snapshots; then
            log_section "Test Comparison Results"
            if [ "$TEST_FAILURES" = true ]; then
                log_warning "⚠️  Tests completed with some failures, but snapshots match"
                log_warning "🔍 Please review test failures above"
                final_exit_code=1
            else
                log_success "🎉 All tests completed successfully!"
                log_success "✅ Fluid and Yjs implementations are functionally equivalent!"
            fi
        else
            log_section "Test Comparison Results"
            log_error "❌ Snapshot comparison failed!"
            log_error "💥 Fluid and Yjs implementations have differences!"
            final_exit_code=1
        fi
    else
        log_section "Test Completion Results"
        if [ "$TEST_FAILURES" = true ]; then
            if [ "$FLUID_ONLY" = true ]; then
                log_warning "⚠️  Fluid branch tests completed with some failures"
            elif [ "$YJS_ONLY" = true ]; then
                log_warning "⚠️  Yjs branch tests completed with some failures"
            fi
            log_warning "🔍 Please review test failures above"
            final_exit_code=1
        else
            if [ "$FLUID_ONLY" = true ]; then
                log_success "🎉 Fluid branch tests completed successfully!"
            elif [ "$YJS_ONLY" = true ]; then
                log_success "🎉 Yjs branch tests completed successfully!"
            fi
        fi
        log_info "ℹ️  Snapshot comparison skipped (single branch mode)"
    fi

    exit $final_exit_code
}

# エラーハンドリング
trap 'cleanup_processes; log_error "Script interrupted or failed"; exit 1' INT TERM ERR

# スクリプト実行
main "$@"
