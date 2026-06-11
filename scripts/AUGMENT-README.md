# Augment専用テストスクリプト

このディレクトリには、Augmentでのテスト実行に特化したスクリプトが含まれています。
既存のプロジェクトスクリプトに影響を与えることなく、Augment環境でのテスト実行を最適化しています。

## スクリプト一覧

### 1. `augment-setup.sh`
テスト環境の初期セットアップを行います。

**機能:**
- システム要件チェック（Java、Node.js、npm）
- 必要なグローバルパッケージのインストール（Firebase CLI、Tinylicious、dotenvx）
- OS依存パッケージのインストール（Playwright依存関係含む）
- プロジェクト依存関係のインストール
- Playwrightブラウザのセットアップ
- 環境ファイルの設定

**使用方法:**
```bash
./scripts/augment-setup.sh
```

### 2. `augment-start-servers.sh`
テスト用サーバーを起動します。

**起動するサーバー:**
- Firebase Emulator (Auth: 59099, Firestore: 58080, Functions: 57000)
- Tinylicious (7092)
- API Server (7091)
- SvelteKit Server (7090)

**使用方法:**
```bash
./scripts/augment-start-servers.sh
```

### 3. `augment-stop-servers.sh`
テスト用サーバーを停止します。

**使用方法:**
```bash
./scripts/augment-stop-servers.sh
```

### 4. `augment-run-tests.sh`
環境セットアップからテスト実行まで一括で行います。

**オプション:**
- `--setup-only`: 環境セットアップのみ
- `--servers-only`: サーバー起動のみ
- `--tests-only`: テスト実行のみ（環境は準備済み前提）
- `--unit`: ユニットテストのみ
- `--e2e`: E2Eテストのみ
- `--help`: ヘルプ表示

**使用例:**
```bash
# 全体実行（セットアップ + サーバー起動 + テスト実行）
./scripts/augment-run-tests.sh

# 環境セットアップのみ
./scripts/augment-run-tests.sh --setup-only

# E2Eテストのみ
./scripts/augment-run-tests.sh --e2e

# 特定のテストパターン実行
./scripts/augment-run-tests.sh --e2e CLM-0103
```

## 設定ファイル

### `firebase.augment.json`
Augment専用のFirebase設定ファイルです。
- ホストを`localhost`に設定
- ポート番号を調整（Functions: 57000, Hosting: 57001）

## 推奨ワークフロー

### 初回セットアップ
```bash
# 1. 環境セットアップ
./scripts/augment-setup.sh

# 2. サーバー起動
./scripts/augment-start-servers.sh

# 3. テスト実行
cd client && npx playwright test
```

### 日常的なテスト実行
```bash
# 一括実行
./scripts/augment-run-tests.sh

# または個別実行
./scripts/augment-run-tests.sh --e2e CLM-0103
```

### PR修正作業時
```bash
# 1. 環境準備
./scripts/augment-setup.sh

# 2. 特定のテスト実行
./scripts/augment-run-tests.sh --e2e "修正対象のテスト"

# 3. 修正後の確認
./scripts/augment-run-tests.sh --tests-only
```

## トラブルシューティング

### Firebase Emulatorが起動しない
- Javaがインストールされているか確認: `java -version`
- ポートが使用中でないか確認: `lsof -i :59099`
- ログを確認: `cat server/logs/firebase-emulator.log`

### Playwrightテストが失敗する
- ブラウザがインストールされているか確認: `npx playwright install chromium`
- システム依存関係を確認: `sudo npx playwright install-deps`

### サーバーが起動しない
- 依存関係がインストールされているか確認
- ログファイルを確認: `server/logs/`配下のファイル
- ポートの競合を確認: `./scripts/augment-stop-servers.sh`で一度停止

## ログファイル

テスト実行時のログは以下の場所に保存されます：
- `server/logs/firebase-emulator.log` - Firebase Emulator
- `server/logs/tinylicious.log` - Tinylicious
- `server/logs/test-auth-service.log` - API Server
- `server/logs/test-svelte-kit.log` - SvelteKit Server

## 注意事項

- これらのスクリプトは既存のプロジェクトスクリプトに影響を与えません
- Augment環境での使用に最適化されています
- 問題が発生した場合は、まず`./scripts/augment-stop-servers.sh`でサーバーを停止してから再試行してください
