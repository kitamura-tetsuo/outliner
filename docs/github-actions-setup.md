# GitHub Actions Setup for Claude Code Integration

このドキュメントでは、issue作成時にClaude Code Actionがself-hosted runnerで実行され、claude-code-routerを使ってGemini CLIが動作するように設定する手順を説明します。

## 概要

### Issue分析機能

- **ワークフロー**: `.github/workflows/issue-claude-action.yml`
- **トリガー**: Issue作成・編集時、または`@claude`を含むコメント作成時
- **実行環境**: Self-hosted runner
- **AI モデル**: Gemini 2.5 Pro (Gemini CLI経由)
- **ルーティング**: Claude Code Router使用

### PR自動テスト修正機能

- **ワークフロー**: `.github/workflows/pr-test-fix.yml`
- **トリガー**: PRのテストが失敗した時
- **実行環境**: Self-hosted runner
- **AI モデル**: Gemini 2.5 Pro (Gemini CLI経由)
- **機能**: テスト失敗を自動分析・修正し、テストがパスするまで繰り返し実行

## 前提条件

### 1. Self-hosted Runnerの設定

GitHub リポジトリにself-hosted runnerを追加する必要があります：

1. リポジトリの Settings > Actions > Runners に移動
2. "New self-hosted runner" をクリック
3. 指示に従ってrunnerを設定

### 2. Runner環境の準備

Self-hosted runner上で以下の環境を準備してください：

```bash
# Node.js 22+ のインストール
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 必要なグローバルパッケージのインストール
npm install -g @google/gemini-cli
npm install -g @musistudio/claude-code-router

# Git設定（GitHub Actions用）
git config --global user.email "github-actions[bot]@users.noreply.github.com"
git config --global user.name "GitHub Actions Bot"
```

### 3. Gemini CLI認証の設定

#### 方法1: OAuth認証（推奨）

Runner上で以下を実行：

```bash
gemini auth login
```

ブラウザが開くので、Googleアカウントでログインし、認証を完了してください。
認証情報は `~/.gemini/oauth_creds.json` に保存されます。

#### 方法2: API Key認証

1. [Google AI Studio](https://aistudio.google.com/app/apikey) でAPI Keyを取得
2. GitHubリポジトリの Settings > Secrets and variables > Actions に移動
3. `GEMINI_API_KEY` という名前でAPI Keyを追加

## ワークフローの動作

### Issue分析ワークフロー

#### トリガー条件

以下の場合にワークフローが実行されます：

- Issue が作成または編集された時
- Issue コメントが作成され、`@claude` が含まれている時

### PR自動テスト修正ワークフロー

#### トリガー条件

以下の場合にワークフローが実行されます：

- PRのテストワークフローが失敗で完了した時
- 対象のPRがオープン状態である時

### 実行ステップ

1. **環境準備**: Node.js、Git設定
2. **Claude Code Router設定**: 設定ファイル作成、transformer取得
3. **Gemini CLI認証確認**: OAuth認証またはAPI Key認証の確認
4. **Router起動**: バックグラウンドでClaude Code Routerを起動
5. **Claude Code Action実行**: Issue分析とレスポンス生成
6. **クリーンアップ**: Routerプロセスの終了

### 設定ファイル

ワークフローは以下の設定でClaude Code Routerを起動します：

**重要な設定項目：**

- **カスタムTransformer**: 実際のGemini CLIコマンドを呼び出すカスタムtransformerを使用
- `forceModel: true`: Gemini CLIに`--force-model`オプションを渡してモデル強制使用
- `"forceModel": "gemini-2.5-pro"`: Routerレベルで特定のモデルを強制指定
- **MCP対応**: 実際のGemini CLIを使用することでMCP等の高度な機能をサポート

```json
{
    "LOG": true,
    "API_TIMEOUT_MS": 600000,
    "transformers": [
        {
            "path": "$HOME/.claude-code-router/plugins/gemini-cli-direct.js",
            "options": {
                "project": "outliner-d57b0",
                "forceModel": true
            }
        }
    ],
    "Providers": [
        {
            "name": "gemini-cli-direct",
            "api_base_url": "http://localhost:3456",
            "api_key": "dummy-key",
            "models": ["gemini-2.5-flash", "gemini-2.5-pro"],
            "transformer": {
                "use": ["gemini-cli-direct"]
            }
        }
    ],
    "Router": {
        "default": "gemini-cli-direct,gemini-2.5-pro",
        "think": "gemini-cli-direct,gemini-2.5-pro",
        "longContext": "gemini-cli-direct,gemini-2.5-pro",
        "longContextThreshold": 60000,
        "forceModel": "gemini-2.5-pro"
    }
}
```

### カスタムGemini CLI Transformer

このプロジェクトでは、実際のGemini CLIコマンドを呼び出すカスタムtransformerを使用しています：

**特徴：**

- **実際のGemini CLI実行**: Google Cloud Code APIではなく、実際の`gemini`コマンドを実行
- **MCP対応**: Gemini CLIの全機能（MCP等）をサポート
- **Force-Model対応**: `--force-model`オプションでモデル強制使用
- **JSON出力**: `--format json`で構造化された出力を取得
- **一時ファイル管理**: 会話データを一時ファイルで管理し、実行後に自動削除

**実行例：**

```bash
gemini --model gemini-2.5-pro --force-model --project outliner-d57b0 --format json --file /tmp/conversation.json
```

## トラブルシューティング

### 認証エラー

```
❌ No Gemini CLI credentials found
```

**解決方法**:

1. Runner上で `gemini auth login` を実行
2. または `GEMINI_API_KEY` シークレットを設定

### Router起動エラー

```
❌ Claude Code Router failed to start within 30 seconds
```

**解決方法**:

1. Runner上で手動で `ccr start` を実行してエラーを確認
2. ポート3456が使用可能か確認
3. ログファイル `~/.claude-code-router.log` を確認

### ネットワークエラー

**解決方法**:

1. Runner環境からGoogle APIへのアクセスが可能か確認
2. プロキシ設定が必要な場合は設定ファイルに追加

## セキュリティ考慮事項

- Self-hosted runnerは信頼できる環境で実行してください
- API Keyは適切にシークレット管理してください
- OAuth認証情報は適切なファイル権限で保護してください
- ログファイルに機密情報が含まれないよう注意してください

## 使用方法

1. 新しいIssueを作成すると自動的にClaude Code Actionが実行されます
2. 既存のIssueに `@claude` を含むコメントを追加すると分析が実行されます
3. 分析結果はIssueコメントとして追加されます

## 制限事項

- Self-hosted runnerでのみ動作します
- Gemini CLI認証が必要です
- インターネット接続が必要です
- 同時実行数は1つのIssueあたり1つに制限されています
