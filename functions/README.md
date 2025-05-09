# Outliner Firebase Functions

## 概要

このディレクトリには、Outlinerアプリケーションで使用するFirebase Functionsが含まれています。
主な機能は以下の通りです：

1. `/api/fluid-token` - Firebase認証トークンを検証し、Azure Fluid RelayのJWTトークンを生成するエンドポイント
2. `/api/save-container` - ユーザーのコンテナIDを保存するエンドポイント
3. `/api/get-user-containers` - ユーザーがアクセス可能なコンテナIDのリストを取得するエンドポイント
4. `/health` - ヘルスチェックエンドポイント

## セットアップ

1. 依存関係をインストール:

```bash
cd functions
npm install
```

2. 環境変数を設定:

```bash
cp .env.example .env
```

`.env`ファイルを編集して、必要な環境変数を設定してください：

- Azure Fluid Relay設定（テナントID、エンドポイント、プライマリキー）

## ローカルでのテスト

Firebase Functionsをローカルで実行するには：

```bash
npm run serve
```

これにより、Functionsエミュレーターが起動し、ローカルでFunctionsをテストできます。

## デプロイ

Firebase Functionsをデプロイするには：

```bash
npm run deploy
```

または、プロジェクトのルートディレクトリから：

```bash
firebase deploy --only functions
```

## 環境変数の設定

本番環境では、Firebase Functionsの環境変数を設定する必要があります：

```bash
firebase functions:config:set azure.tenant_id="your-tenant-id" azure.endpoint="https://us.fluidrelay.azure.com" azure.primary_key="your-primary-key"
```

## 注意事項

- Firebase Functionsは、Node.js 22ランタイムを使用しています
- 本番環境では、適切なセキュリティルールを設定してください
- Azure Fluid Relay設定は、Firebase Functionsの環境変数として設定する必要があります
