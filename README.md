# Outliner

Outlinerは、Azure Fluid Relayを使用したリアルタイム共同編集アプリケーションです。

## AI統合機能

### 自動PR-Issue連携機能

このリポジトリには、Gemini CLIとGitHub MCPサーバー統合を使用した自動PR-Issue連携機能が含まれています。PRを作成すると、システムが自動的にPRの内容を分析し、関連するオープンなissueにリンクします。

### Claude Code Action統合

Issue作成時に自動的にClaude Code Actionが実行され、AIによる分析とサポートを提供します：

- **トリガー**: Issue作成・編集時、または`@claude`を含むコメント
- **実行環境**: Self-hosted runner
- **AI モデル**: Gemini 2.5 Pro (実際のGemini CLI経由、MCP対応)
- **機能**: Issue分析、コード提案、質問回答

### PR自動テスト修正機能

PRのテストが失敗した場合、Claude Code Actionが自動的に修正を試行します：

- **トリガー**: PRテスト失敗時
- **実行環境**: Self-hosted runner
- **AI モデル**: Gemini 2.5 Pro (実際のGemini CLI経由、MCP対応)
- **機能**: テスト失敗分析、コード修正、テストがパスするまで繰り返し実行（最大5回）

詳細な設定手順は [docs/github-actions-setup.md](docs/github-actions-setup.md) を参照してください。

### 改善されたワークフロー

ワークフローを2段階アプローチに改善しました：

1. **Issue探索段階**: Gemini CLIが関連issueを分析してJSON形式で出力
2. **PR更新段階**: GitHub CLIが確実にPR説明を更新

この改善により、より信頼性の高い自動リンク機能を実現しています。

### 機能テスト

このPRは自動連携機能のテストを目的としています。システムが以下の処理を実行することを期待しています：

- オープンなissueの検索と分析
- PRタイトルと説明の内容分析
- 関連するissueの自動リンク

### ワークフロー改善

ワークフローに詳細なログ出力と改善されたエラーハンドリングを追加しました：

- Gemini CLI認証の詳細チェック
- 設定ファイルの存在確認

### ワークフロー検証テスト

このセクションは自動PR-issue連携ワークフローの動作を検証するために追加されました。

- 実行ログの保存と出力
- より詳細なエラーメッセージ

## 開発環境のセットアップ

1. 依存関係をインストール:

```bash
# クライアント側の依存関係
cd client
npm install

# サーバー側の依存関係
cd ../server
npm install

# Firebase Functions側の依存関係
cd ../functions
npm install

# Python依存関係 (feature-map スクリプト用)
cd ..
pip install -r scripts/requirements.txt
```

2. 環境変数を設定:

```bash
# クライアント側
cd client
cp .env.example .env

# サーバー側
cd ../server
cp .env.example .env

# ネットワーク経由でアクセスする場合は .env の `LOCAL_HOST` にローカル IP を設定

# Firebase Functions側
cd ../functions
cp .env.example .env
```

### .envファイルの暗号化

開発用の環境変数ファイルは [`dotenvx`](https://dotenvx.com/) を使って暗号化します。
初回セットアップ後に以下を実行して `.env.development` を暗号化してください。

```bash
npx @dotenvx/dotenvx encrypt --env-file server/.env.development
```

このコマンドは `.env.development` を暗号化して同じファイル名のまま上書きします。

復号化が必要な場合は `decrypt` サブコマンドを使用します。

## 開発サーバーの起動

### クライアント開発サーバー

```bash
cd client
npm run dev

# または、ネットワーク上で公開する場合
npm run dev:host
```

### 認証サーバー（開発用）

```bash
cd server
npm run dev
```

### Firebase Emulators（開発用）

```bash
cd firebase
firebase emulators:start
```

## ビルドとデプロイ

### クライアントのビルド

```bash
cd client
npm run build
```

### Firebase Hosting + Functionsへのデプロイ

1. Firebase CLIをインストール:

```bash
npm install -g firebase-tools
```

2. Firebaseにログイン:

```bash
firebase login
```

3. プロジェクトを選択:

```bash
firebase use your-project-id
```

4. 環境変数を設定:

```bash
# Azure Fluid Relay設定
firebase functions:config:set azure.tenant_id="your-tenant-id" azure.endpoint="https://us.fluidrelay.azure.com" azure.primary_key="your-primary-key"
```

5. クライアントをビルド:

```bash
cd client
npm run build
```

6. デプロイ:

```bash
firebase deploy
```

## 環境変数

### 開発環境

- クライアント: `VITE_PORT=7070`
- API: `PORT=7071`
- Tinylicious: `VITE_TINYLICIOUS_PORT=7072`

### テスト環境

- クライアント: `VITE_PORT=7080`
- Tinylicious: `VITE_TINYLICIOUS_PORT=7082`
- Firebase Emulator host: `VITE_FIREBASE_EMULATOR_HOST=localhost`

## Firebase Hosting + Functions

Firebase Hosting + Functionsを使用する場合は、以下の設定が必要です：

1. クライアント側の環境変数を更新:

```bash
cd client
cp .env.firebase.example .env
```

2. Firebase Functionsの環境変数を設定:

```bash
firebase functions:config:set azure.tenant_id="your-tenant-id" azure.endpoint="https://us.fluidrelay.azure.com" azure.primary_key="your-primary-key"
```

3. デプロイ:

```bash
firebase deploy
```

## 使用しているオープンソースライブラリ

このプロジェクトでは以下の主要なオープンソースライブラリを採用しています。

- **SvelteKit** / **Svelte** - クライアント UI 開発に使用。
- **Express** - 認証サーバーを構築。
- **Firebase** - 認証やホスティングに利用。
- **Fluid Framework** - リアルタイムコラボレーション機能の基盤。

各ライブラリはMITやApacheなどのライセンスの下で公開されており、`package.json`に詳細が記載されています。

## SSO ログイン手順（新入社員向け）

1. 会社のSSOアカウントを取得後、社内管理者へGitHubユーザー名を連絡してください。
2. リポジトリへのアクセス権が付与されたら、ブラウザで `/login` へアクセスしてSSOログインを完了します。
3. 初回ログイン後はFirebase Authenticationにも自動登録されます。

## テスト実行方法

ユニットテストは `Vitest`、E2E テストは `Playwright` を使用しています。

```bash
# ユニットテスト
cd client
npm run test:unit

# E2E テスト (dotenvxで復号化して実行)
dotenvx run -- npm run test:e2e

# 環境維持テスト (Vitest)
dotenvx run -- npm run test:env
```

テストの前には `scripts/codex-setup.sh` を実行してローカルのエミュレータ群を起動してください。
スクリプトは初回実行後にインストール結果をキャッシュするため、二回目以降は依存関係のインストールをスキップして短時間で完了します。

自動化されたテストにより、主要機能の回帰を防ぎます。CI環境でも同じコマンドが実行されます。

### Playwrightテストを順番に実行する

Codex環境では複数のE2Eテストを一度に実行するとタイムアウト (timeout) することがあります。`scripts/run-e2e-progress-for-codex.sh 1` を使うと、テストファイルを1件ずつ実行できます。
This prevents timeout errors during cording agent's env runs.

```bash
scripts/run-e2e-progress-for-codex.sh 1
```

このスクリプトは進捗を `.e2e-progress` ファイルに記録し、途中でタイムアウト (timeout) した場合でも続きから再開できます。タイムアウト (timeout) したテストはログに記録してください。
`.e2e-progress` を削除すると最初から実行できます。

### ローカルサーバーをまとめて起動する

手元で手動テストを行うときは `scripts/start-all-localhost-servers.sh` を実行します。SvelteKit、API、Tinylicious、Firebase エミュレータがバックグラウンドで起動し、`Ctrl+C` で全て停止できます。

## 機能ドキュメントの集約

`docs/client-features.yaml` と `docs/dev-features.yaml` は、`docs/client-features/` と `docs/dev-features/` 以下の YAML を集約して生成します。新しい YAML ファイルを追加したら次のコマンドを実行してください。

```bash
python scripts/aggregate_features.py
```

### pre-push でフォーマットを検証する

push 前に `dprint check` を実行して未フォーマットのファイルがないか確認します。次のようにフックを設定してください。

```bash
ln -s ../../scripts/pre_push.sh .git/hooks/pre-push
```

未フォーマットのファイルがある場合、push は拒否されます。
