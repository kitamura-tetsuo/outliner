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
```

2. 環境変数を設定:

```bash
# クライアント側
cd client
cp .env.example .env

# サーバー側
cd ../server
cp .env.example .env

# Firebase Functions側
cd ../functions
cp .env.example .env
```

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
- Tinylicious: `VITE_TINYLICIOUS_ENDPOINT=7072`

### テスト環境

- クライアント: `VITE_PORT=7080`
- Tinylicious: `VITE_TINYLICIOUS_ENDPOINT=7082`

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
