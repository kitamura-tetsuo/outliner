#!/bin/bash

# スナップショット比較スクリプト
# FluidブランチとYjsブランチでE2Eテストを実行し、スナップショットを比較する

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

# 設定
OUTLINER_YJS_DIR="/home/ubuntu/src2/outliner"
OUTLINER_FLUID_DIR="/home/ubuntu/src2/outliner-fluid"
CURRENT_DIR=$(pwd)

# 引数の処理
RUN_TESTS=true
COMPARE_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --compare-only)
            COMPARE_ONLY=true
            RUN_TESTS=false
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --compare-only    既存のスナップショットのみを比較（テストは実行しない）"
            echo "  --help, -h        このヘルプを表示"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# 関数: テストを実行してスナップショットを生成
run_tests_for_branch() {
    local branch_name=$1
    local branch_dir=$2
    local mode=$3
    
    log_info "Running tests for $branch_name branch ($mode mode)..."
    
    cd "$branch_dir/client"
    
    # 依存関係のインストール確認
    if [ ! -d "node_modules" ]; then
        log_info "Installing dependencies for $branch_name..."
        npm install
    fi
    
    # サーバーを起動
    log_info "Starting server for $branch_name..."
    npm run dev -- --port 7090 --host 0.0.0.0 > /dev/null 2>&1 &
    SERVER_PID=$!
    
    # サーバーが起動するまで待機
    sleep 10
    
    # テストを実行
    log_info "Running E2E tests for $branch_name..."
    if npx playwright test --project=basic --grep "Add Text button should add text to shared content" --timeout=60000; then
        log_success "Tests completed for $branch_name"
    else
        log_warning "Some tests failed for $branch_name, but continuing..."
    fi
    
    # サーバーを停止
    kill $SERVER_PID 2>/dev/null || true
    sleep 2
    
    cd "$CURRENT_DIR"
}

# 関数: スナップショットを比較
compare_snapshots() {
    log_info "Comparing snapshots..."
    
    # Yjsブランチのスナップショットディレクトリに移動
    cd "$OUTLINER_YJS_DIR/client"
    
    # TypeScriptスクリプトを実行
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
    log_info "Starting snapshot comparison process..."
    
    # ディレクトリの存在確認
    if [ ! -d "$OUTLINER_YJS_DIR" ]; then
        log_error "Yjs branch directory not found: $OUTLINER_YJS_DIR"
        exit 1
    fi
    
    if [ ! -d "$OUTLINER_FLUID_DIR" ]; then
        log_error "Fluid branch directory not found: $OUTLINER_FLUID_DIR"
        exit 1
    fi
    
    if [ "$RUN_TESTS" = true ]; then
        # 既存のスナップショットをクリア
        log_info "Clearing existing snapshots..."
        rm -rf "$OUTLINER_YJS_DIR/client/e2e-snapshots"/*.json 2>/dev/null || true
        rm -rf "$OUTLINER_FLUID_DIR/client/e2e-snapshots"/*.json 2>/dev/null || true
        
        # Yjsブランチでテスト実行
        run_tests_for_branch "Yjs" "$OUTLINER_YJS_DIR" "yjs"
        
        # Fluidブランチでテスト実行
        run_tests_for_branch "Fluid" "$OUTLINER_FLUID_DIR" "fluid"
        
        # FluidブランチのスナップショットをYjsブランチにコピー
        log_info "Copying Fluid snapshots to Yjs branch for comparison..."
        mkdir -p "$OUTLINER_YJS_DIR/client/e2e-snapshots"
        cp "$OUTLINER_FLUID_DIR/client/e2e-snapshots"/*-fluid.json "$OUTLINER_YJS_DIR/client/e2e-snapshots/" 2>/dev/null || true
    fi
    
    # スナップショットを比較
    if compare_snapshots; then
        log_success "Snapshot comparison completed successfully!"
        exit 0
    else
        log_error "Snapshot comparison failed!"
        exit 1
    fi
}

# スクリプト実行
main "$@"
