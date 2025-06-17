# Outliner

Outlinerは、Azure Fluid Relayを使用したリアルタイム共同編集アプリケーションです。

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

暗号化キーは `.env.keys` に保存されます。このファイルはリポジトリに含めないよう
`.gitignore` にエントリがあることを確認してください。

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

クラウド上のサービスを利用する場合と、Firebase Emulator を利用する場合で使用するポートが異なります。

- **クラウド環境アクセス用**
  - クライアント: `VITE_PORT=7070`
  - API: `PORT=7071`
  - Tinylicious: `VITE_TINYLICIOUS_PORT=7072`
  - Firebase Functions はデバッグのためローカルを利用します
  - Firebase Functions Host: `VITE_FIREBASE_FUNCTIONS_HOST=localhost`
  - Firebase Functions Port: `VITE_FIREBASE_FUNCTIONS_PORT=57070`

- **エミュレータ利用時**
  - クライアント: `VITE_PORT=7090`
  - API: `PORT=7091`
  - Tinylicious: `VITE_TINYLICIOUS_PORT=7092`
  - Firebase Functions Host: `VITE_FIREBASE_FUNCTIONS_HOST=localhost`
  - Firebase Functions Port: `VITE_FIREBASE_FUNCTIONS_PORT=57070`

### テスト環境

- クライアント: `VITE_PORT=7090`
- Playwright: `PORT=7090` (override when running e2e tests)
- Tinylicious: `VITE_TINYLICIOUS_PORT=7092`
- Firebase Functions Host: `VITE_FIREBASE_FUNCTIONS_HOST=localhost`
- Firebase Functions Port: `VITE_FIREBASE_FUNCTIONS_PORT=57070`

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

本プロジェクトでは、アプリケーションの各部分（クライアント、Firebase Functions、サーバー）に対してユニットテストが用意されています。
テストカバレッジレポートも生成可能です。

テスト実行前に、必要に応じて各ディレクトリ（`client`, `functions`, `server`）で `npm install` を実行し、依存関係をインストールしてください。
また、一部のテスト（特にクライアントの連携テスト）はFirebase EmulatorやTinyliciousサーバーなどのローカルサービスが起動していることを前提とする場合があります。詳細は各テストスイートのドキュメントや `scripts/codex-setp.sh` を参照してください。

### クライアント (client)

クライアントサイドのテストは [Vitest](https://vitest.dev/) を使用しています。

**重要:** テスト実行前に必ず `scripts/codex-setp.sh` を実行してローカルのエミュレータ群を起動してください。
This script must run **before every test** to ensure all services are available.

```bash
# ユニットテスト
cd client
npm run test:unit

# E2E テストは Playwright を用います。実行前に必ず環境をセットアップしてください。
# まず `scripts/codex-setp.sh` を実行し、Firebase Emulator などのローカルサービスを
# 起動します。その後、Playwright のテストファイルを個別に実行します。

# Playwright テストを 1 ファイルずつ実行する場合
scripts/run-tests.sh client/e2e/your-spec-file.spec.ts
# Example: run the collaboration cursor test
scripts/run-tests.sh client/e2e/collaboration/COL-0001.spec.ts
# 環境変数 `PORT` を指定して別ポートで実行する例
PORT=7100 scripts/run-tests.sh client/e2e/your-spec-file.spec.ts
```

-   **ユニットテストの実行:**
    ```bash
    cd client
    npm run test:unit
    ```
    このコマンドはテストを実行し、同時にカバレッジレポートを生成します（`--coverage` フラグが含まれているため）。

-   **カバレッジレポートの確認:**
    -   テキストサマリー: コンソールに出力されます。
    -   HTMLレポート: `client/coverage/vitest/index.html` をブラウザで開いて確認できます。
    -   LCOVレポート: `client/coverage/vitest/lcov.info` (CIや外部ツール連携用)

-   **E2Eテスト:**
    E2Eテストは [Playwright](https://playwright.dev/) を使用しています。
    ```bash
    cd client
    npm run test:e2e
    ```
    特定のE2Eテストファイルを実行する場合:
    ```bash
    # client ディレクトリのルートから実行
    npx playwright test e2e/your-spec-file.spec.ts
    # またはプロジェクトルートからスクリプト経由で
    # scripts/run-tests.sh client/e2e/your-spec-file.spec.ts
    ```

### Firebase Functions (functions)

Firebase Functionsのテストは [Jest](https://jestjs.io/) を使用しています。

-   **テストの実行:**
    ```bash
    cd functions
    npm test
    ```

-   **カバレッジレポートの生成と確認:**
    ```bash
    cd functions
    npm run test:coverage
    ```
    -   テキストサマリー: コンソールに出力されます。
    -   HTMLレポート: `functions/coverage/index.html` をブラウザで開いて確認できます。
    -   LCOVレポート: `functions/coverage/lcov.info`

### サーバー (server)

サーバーサイドのテストは [Mocha](https://mochajs.org/) と [Chai](https://www.chaijs.com/) を使用し、カバレッジは [NYC (Istanbul)](https://istanbul.js.org/) で収集します。

-   **テストの実行:**
    ```bash
    cd server
    npm test
    ```

-   **カバレッジレポートの生成と確認:**
    ```bash
    cd server
    npm run test:coverage
    ```
    -   テキストサマリー: コンソールに出力されます。
    -   HTMLレポート: `server/coverage/mocha/index.html` をブラウザで開いて確認できます。
    -   LCOVレポート: `server/coverage/mocha/lcov.info`

### E2E テストのガイドライン

- `.nth()` などの位置指定は使わず、必ず `data-item-id` 属性を用いて要素を取得します。
- DOM へアクセスする場合は `TestHelpers` 経由で実行し、`page.evaluate` を直接書かないようにします。

自動化されたテストにより、主要機能の回帰を防ぎます。CI環境でも同じコマンドが実行されます。

### Feature Map の更新

テストファイルや `docs/client-features.yaml` を変更した後は、機能とテストの対応表を更新するため次のコマンドを実行してください。

```bash
python scripts/gen_feature_map.py
```

`docs/feature-map.md` は自動生成されるファイルで Git 管理には含めません。

## Using encrypted .env files

Encrypted `.env` files created with `dotenvx` can be used directly when running
commands. Prepend `npx dotenvx run --env-file=<file>` to your usual command.

```bash
# Development
npx dotenvx run --env-file=server/.env.development npm run dev

# Testing
npx dotenvx run --env-file=server/.env.test npm run test:e2e

# Deployment
npx dotenvx run --env-file=server/.env.production firebase deploy
```
