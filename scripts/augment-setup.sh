#!/bin/bash
# Augment専用のテスト環境セットアップスクリプト
# 他のスクリプトに影響を与えずに、Augmentでのテスト実行に必要な環境を構築します

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
set -euo pipefail

# Error handling
trap 'echo "Error occurred at line $LINENO. Exit code: $?" >&2' ERR

echo "=== Augment Test Environment Setup ==="
echo "ROOT_DIR: ${ROOT_DIR}"

# システム要件チェック
check_system_requirements() {
    echo "Checking system requirements..."
    
    # Java チェック
    if ! command -v java >/dev/null 2>&1; then
        echo "Installing Java..."
        sudo apt update
        sudo apt install -y openjdk-11-jdk
    else
        echo "Java is already installed: $(java -version 2>&1 | head -n1)"
    fi
    
    # Node.js チェック
    if ! command -v node >/dev/null 2>&1; then
        echo "Error: Node.js is not installed"
        exit 1
    else
        echo "Node.js is available: $(node --version)"
    fi
    
    # npm チェック
    if ! command -v npm >/dev/null 2>&1; then
        echo "Error: npm is not installed"
        exit 1
    else
        echo "npm is available: $(npm --version)"
    fi
}

# NVM環境の読み込み
load_nvm() {
    if [ -d "$HOME/.nvm" ] && [ -s "$HOME/.nvm/nvm.sh" ]; then
        . "$HOME/.nvm/nvm.sh"
        echo "NVM loaded successfully"
    else
        echo "NVM not found, using system Node.js"
    fi
}

# ログディレクトリの作成
create_log_directories() {
    local log_dirs=(
        "${ROOT_DIR}/logs"
        "${ROOT_DIR}/client/logs"
        "${ROOT_DIR}/client/e2e/logs"
        "${ROOT_DIR}/server/logs"
        "${ROOT_DIR}/functions/logs"
    )
    
    for dir in "${log_dirs[@]}"; do
        mkdir -p "${dir}"
        echo "Created log directory: ${dir}"
    done
}

# 古いログファイルのクリア
clear_log_files() {
    local log_dirs=(
        "${ROOT_DIR}/logs"
        "${ROOT_DIR}/client/logs"
        "${ROOT_DIR}/client/e2e/logs"
        "${ROOT_DIR}/server/logs"
        "${ROOT_DIR}/functions/logs"
    )
    
    for dir in "${log_dirs[@]}"; do
        if [ -d "${dir}" ]; then
            rm -rf "${dir}"/* 2>/dev/null || true
            echo "Cleared log directory: ${dir}"
        fi
    done
}

# グローバルパッケージのインストール
install_global_packages() {
    echo "Installing global packages..."
    
    # Firebase CLI
    if ! command -v firebase >/dev/null 2>&1; then
        echo "Installing Firebase CLI..."
        sudo npm install -g firebase-tools
    else
        echo "Firebase CLI is already installed"
    fi
    
    # Tinylicious
    if ! command -v tinylicious >/dev/null 2>&1; then
        echo "Installing Tinylicious..."
        sudo npm install -g tinylicious
    else
        echo "Tinylicious is already installed"
    fi
    
    # dotenvx
    if ! command -v dotenvx >/dev/null 2>&1; then
        echo "Installing dotenvx..."
        sudo npm install -g @dotenvx/dotenvx
    else
        echo "dotenvx is already installed"
    fi
}

# OS依存パッケージのインストール
install_os_utilities() {
    echo "Installing OS utilities..."
    
    # 必要なパッケージリスト
    local packages=(
        lsof
        netcat-openbsd
        curl
        wget
        libasound2
    )
    
    # Playwrightブラウザ依存関係
    local playwright_deps=(
        libatk1.0-0
        libatk-bridge2.0-0
        libcups2
        libdbus-1-3
        libdrm2
        libgbm1
        libgtk-3-0
        libnspr4
        libnss3
        libx11-6
        libx11-xcb1
        libxcb1
        libxcomposite1
        libxdamage1
        libxext6
        libxfixes3
        libxrandr2
        libxtst6
        ca-certificates
        fonts-liberation
        lsb-release
        xdg-utils
    )
    
    # パッケージが不足しているかチェック
    local needs_install=false
    for pkg in "${packages[@]}" "${playwright_deps[@]}"; do
        if ! dpkg -s "${pkg}" >/dev/null 2>&1; then
            needs_install=true
            break
        fi
    done
    
    if [ "$needs_install" = true ]; then
        echo "Installing missing system packages..."
        sudo apt update
        DEBIAN_FRONTEND=noninteractive sudo apt install -y "${packages[@]}" "${playwright_deps[@]}"
    else
        echo "All required system packages are already installed"
    fi
}

# 依存関係のインストール
install_dependencies() {
    echo "Installing project dependencies..."
    
    # Server dependencies
    if [ -f "${ROOT_DIR}/server/package.json" ]; then
        echo "Installing server dependencies..."
        cd "${ROOT_DIR}/server"
        if [ ! -d node_modules ]; then
            npm ci
        else
            echo "Server dependencies already installed"
        fi
    fi
    
    # Functions dependencies
    if [ -f "${ROOT_DIR}/functions/package.json" ]; then
        echo "Installing functions dependencies..."
        cd "${ROOT_DIR}/functions"
        if [ ! -d node_modules ]; then
            npm ci
        else
            echo "Functions dependencies already installed"
        fi
    fi
    
    # Client dependencies
    if [ -f "${ROOT_DIR}/client/package.json" ]; then
        echo "Installing client dependencies..."
        cd "${ROOT_DIR}/client"
        if [ ! -d node_modules ]; then
            npm ci
        else
            echo "Client dependencies already installed"
        fi
    fi
    
    cd "${ROOT_DIR}"
}

# Playwrightのセットアップ
setup_playwright() {
    echo "Setting up Playwright..."
    cd "${ROOT_DIR}/client"
    
    # Playwrightブラウザのインストール
    if [ ! -d ~/.cache/ms-playwright ]; then
        echo "Installing Playwright browsers..."
        npx playwright install chromium
    else
        echo "Playwright browsers already installed"
    fi
    
    # システム依存関係のインストール（必要に応じて）
    if ! npx playwright install-deps chromium 2>/dev/null; then
        echo "Note: Some Playwright dependencies may be missing, but continuing..."
    fi
    
    cd "${ROOT_DIR}"
}

# 環境ファイルのセットアップ
setup_environment_files() {
    echo "Setting up environment files..."
    
    # setup-local-env.shを実行
    if [ -f "${ROOT_DIR}/scripts/setup-local-env.sh" ]; then
        chmod +x "${ROOT_DIR}/scripts/setup-local-env.sh"
        "${ROOT_DIR}/scripts/setup-local-env.sh"
    else
        echo "Warning: setup-local-env.sh not found"
    fi
    
    # 環境変数の読み込み
    if [ -f "${ROOT_DIR}/server/.env" ]; then
        set -a
        source "${ROOT_DIR}/server/.env"
        set +a
        echo "Loaded server environment variables"
    fi
    
    if [ -f "${ROOT_DIR}/client/.env" ]; then
        set -a
        source "${ROOT_DIR}/client/.env"
        set +a
        echo "Loaded client environment variables"
    fi
    
    if [ -f "${ROOT_DIR}/client/.env.test" ]; then
        set -a
        source "${ROOT_DIR}/client/.env.test"
        set +a
        echo "Loaded client test environment variables"
    fi
}

# メイン実行
main() {
    check_system_requirements
    load_nvm
    create_log_directories
    clear_log_files
    install_global_packages
    install_os_utilities
    setup_environment_files
    install_dependencies
    setup_playwright
    
    echo ""
    echo "=== Augment Test Environment Setup Complete ==="
    echo "You can now run tests using:"
    echo "  cd client && npx playwright test"
    echo "  npm test (for unit tests)"
    echo ""
    echo "To start test servers, use the existing scripts:"
    echo "  scripts/codex-setp.sh (for full environment)"
    echo ""
}

# スクリプトが直接実行された場合のみmainを実行
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
