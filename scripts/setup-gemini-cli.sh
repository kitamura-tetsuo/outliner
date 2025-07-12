#!/bin/bash

# Gemini CLI Setup Script for Self-Hosted GitHub Actions Runner
# このスクリプトはself-hosted runnerでGemini CLIの認証を設定します

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

# Check if running as root and determine target user
if [ "$EUID" -eq 0 ]; then
    print_warning "rootユーザーで実行されています"

    # Check if runner user exists
    if id "runner" >/dev/null 2>&1; then
        print_info "runnerユーザーが見つかりました。runnerユーザー用に設定を行います"
        TARGET_USER="runner"
        TARGET_HOME="/home/runner"
    else
        print_error "runnerユーザーが見つかりません"
        print_info "GitHub Actions runnerの実行ユーザーを確認してください"
        print_info "利用可能なユーザー:"
        cut -d: -f1 /etc/passwd | grep -v "^root$" | head -10
        exit 1
    fi
else
    TARGET_USER="$USER"
    TARGET_HOME="$HOME"
fi

print_info "対象ユーザー: $TARGET_USER"
print_info "対象ホームディレクトリ: $TARGET_HOME"

print_header "Gemini CLI Setup for Self-Hosted Runner"

# Check if Node.js is available
if ! command -v node >/dev/null 2>&1; then
    print_error "Node.js が見つかりません"
    print_info "Node.js をインストールしてから再実行してください"
    exit 1
fi

print_info "Node.js version: $(node --version)"
print_info "NPM version: $(npm --version)"

# Check if npm is available
if ! command -v npm >/dev/null 2>&1; then
    print_error "npm が見つかりません"
    exit 1
fi

# Install Gemini CLI if not available
if ! command -v gemini >/dev/null 2>&1; then
    print_info "Gemini CLI をインストールしています..."
    if npm install -g @google/generative-ai-cli; then
        print_success "Gemini CLI のインストールが完了しました"
    else
        print_error "Gemini CLI のインストールに失敗しました"
        print_info "手動でインストールしてください: npm install -g @google/generative-ai-cli"
        exit 1
    fi
else
    print_success "Gemini CLI は既にインストールされています"
    print_info "Version: $(gemini --version 2>/dev/null || echo 'version check failed')"
fi

# Function to run command as target user
run_as_target_user() {
    if [ "$TARGET_USER" = "$USER" ]; then
        # Same user, run directly
        eval "$1"
    else
        # Different user, use su
        su - "$TARGET_USER" -c "$1"
    fi
}

# Check if authentication already exists
OAUTH_FILE="$TARGET_HOME/.gemini/oauth_creds.json"
if [ -f "$OAUTH_FILE" ]; then
    print_success "既存の認証情報が見つかりました: $OAUTH_FILE"

    # Check file permissions
    PERMS=$(stat -c "%a" "$OAUTH_FILE" 2>/dev/null || stat -f "%A" "$OAUTH_FILE" 2>/dev/null || echo "unknown")
    if [ "$PERMS" = "600" ]; then
        print_success "ファイル権限は適切です (600)"
    else
        print_warning "ファイル権限を修正しています..."
        chmod 600 "$OAUTH_FILE"
        chown "$TARGET_USER:$TARGET_USER" "$OAUTH_FILE" 2>/dev/null || true
        print_success "ファイル権限を600に設定しました"
    fi

    # Test authentication
    print_info "認証をテストしています..."
    if run_as_target_user "timeout 10 gemini models list >/dev/null 2>&1"; then
        print_success "認証テストが成功しました！"
        print_success "Gemini CLI は使用可能です"
        exit 0
    else
        print_warning "認証テストに失敗しました。再認証が必要です"
    fi
fi

# Check if API key is already set
if [ -n "$GEMINI_API_KEY" ] || [ -n "$GOOGLE_API_KEY" ]; then
    print_success "API Keyが設定されています"
    print_info "認証をテストしています..."
    if run_as_target_user "timeout 10 gemini --version >/dev/null 2>&1"; then
        print_success "Gemini CLI は使用可能です"
        exit 0
    else
        print_warning "API Keyでの認証テストに失敗しました"
    fi
fi

# Perform OAuth authentication via browser (prioritized)
print_header "OAuth認証の実行"
print_info "Gemini CLIを実行して、ブラウザでの認証を行います"
print_info "ブラウザが開いたらGoogleアカウントでログインしてください"
print_warning "注意: この操作にはブラウザアクセスが必要です"

# Create .gemini directory if it doesn't exist
run_as_target_user "mkdir -p '$TARGET_HOME/.gemini'"

# Check if we're in a CI environment and warn but continue
if [ -n "$CI" ] || [ -n "$GITHUB_ACTIONS" ]; then
    print_warning "CI環境が検出されました"
    print_info "CI環境ではブラウザ認証ができない場合があります"
    print_info "認証に失敗した場合は、以下の方法を使用してください:"
    print_info ""
    print_info "方法1: API Keyを使用（推奨）"
    print_info "  1. Google AI Studio (https://aistudio.google.com/apikey) でAPI Keyを生成"
    print_info "  2. GitHub SecretsにGEMINI_API_KEYとして登録"
    print_info ""
    print_info "方法2: OAuth認証情報を転送"
    print_info "  1. ローカルマシンで 'gemini' を実行して認証"
    print_info "  2. scripts/generate-gemini-secret.sh を実行してBase64値を生成"
    print_info "  3. GitHub SecretsにGEMINI_OAUTH_B64として登録"
    print_info ""
    print_info "詳細は docs/gemini-cli-setup.md を参照してください"
    print_info ""
    print_info "ブラウザ認証を試行します..."
fi

# Run gemini CLI to trigger browser authentication
print_info "Gemini CLIを実行します..."
print_info "認証画面が表示されたら、指示に従ってGoogleアカウントでログインしてください"
print_info "認証完了後、CLIで 'exit' と入力して終了してください"

if run_as_target_user "gemini"; then
    print_success "Gemini CLIが正常に終了しました"
else
    print_info "Gemini CLIが終了しました（認証が完了している可能性があります）"
fi

# Check if authentication file was created
if [ -f "$OAUTH_FILE" ]; then
    chmod 600 "$OAUTH_FILE"
    chown "$TARGET_USER:$TARGET_USER" "$OAUTH_FILE" 2>/dev/null || true
    print_success "認証ファイルが作成されました: $OAUTH_FILE"
    print_success "認証ファイルの権限を設定しました"

    # Test authentication
    print_info "認証をテストしています..."
    if run_as_target_user "timeout 10 gemini --version >/dev/null 2>&1"; then
        print_success "認証テストが成功しました！"
        print_success "Gemini CLI のセットアップが完了しました"
    else
        print_warning "認証テストでタイムアウトが発生しましたが、認証ファイルは作成されています"
        print_info "手動で確認してください: gemini --version"
    fi
else
    print_warning "OAuth認証ファイルが見つかりません"
    print_info "認証が完了していない可能性があります"
    print_info ""
    print_info "以下の方法を試してください:"
    print_info ""
    print_info "方法1: 再度ブラウザ認証を実行"
    print_info "  このスクリプトを再実行してください"
    print_info ""
    print_info "方法2: API Keyを使用"
    print_info "  1. https://aistudio.google.com/apikey でAPI Keyを生成"
    print_info "  2. export GEMINI_API_KEY='your-api-key' で環境変数を設定"
    print_info ""
    print_info "方法3: 手動でGemini CLIを実行"
    print_info "  gemini コマンドを直接実行して認証を完了してください"

    if [ -n "$CI" ] || [ -n "$GITHUB_ACTIONS" ]; then
        print_info ""
        print_info "CI環境では、GitHub Secretsを使用することを推奨します"
        print_info "詳細は docs/gemini-cli-setup.md を参照してください"
    fi

    exit 1
fi

print_header "GitHub MCP サーバーの設定"
print_info "GitHub MCP サーバーを設定しています..."

# Create GitHub MCP server configuration
SETTINGS_FILE="$TARGET_HOME/.gemini/settings.json"
if [ -f "$SETTINGS_FILE" ]; then
    print_info "既存のsettings.jsonが見つかりました"
    # Backup existing settings
    cp "$SETTINGS_FILE" "$SETTINGS_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    print_info "既存設定をバックアップしました"
else
    print_info "新しいsettings.jsonを作成します"
    run_as_target_user "mkdir -p '$TARGET_HOME/.gemini'"
fi

# Create settings.json with GitHub MCP server
cat > "$SETTINGS_FILE" << 'EOF'
{
  "theme": "Default Dark",
  "selectedAuthType": "oauth-personal",
  "checkpointing": {"enabled": true},
  "mcpServers": {
    "github": {
      "httpUrl": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "${GEMINI_GITHUB_PAT}"
      },
      "timeout": 10000
    }
  }
}
EOF

# Set proper ownership
chown "$TARGET_USER:$TARGET_USER" "$SETTINGS_FILE" 2>/dev/null || true
chmod 600 "$SETTINGS_FILE"

print_success "GitHub MCP サーバーの設定が完了しました"
print_info "設定ファイル: $SETTINGS_FILE"

print_header "セットアップ完了"
print_success "Gemini CLI が GitHub Actions で使用可能になりました"
print_info "認証情報の場所: $OAUTH_FILE"
print_info "対象ユーザー: $TARGET_USER"
print_info "使用制限: 60 RPM / 1,000 RPD (OAuth無料枠)"

# Display next steps
print_header "次のステップ"
echo "1. GitHub Personal Access Token (PAT) を作成"
echo "   - GitHub > Settings > Developer settings > Personal access tokens"
echo "   - 必要な権限: repo, issues, pull_requests"
echo "2. GitHub SecretsにGEMINI_GITHUB_PATとして登録"
echo "3. GitHub Actions ワークフローを実行して動作確認"
echo "4. 必要に応じて他のrunnerでも同様の設定を実行"

print_info "詳細な情報は docs/gemini-cli-setup.md を参照してください"
