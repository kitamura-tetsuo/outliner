# Outliner 認証サーバー

## 概要

このサーバーは以下の機能を提供します：

1. Firebase認証トークンの検証
2. Azure Fluid Relay用のJWTトークン生成

## セットアップ

1. 依存関係をインストール:
```bash
npm install
```

2. `.env` ファイルを作成:
```bash
cp .env.example .env
```

3. 環境変数を設定:
   - Azure Fluid Relay設定（テナントID、エンドポイント、プライマリキー）
   - サーバー設定（ポート、CORS設定など）

4. Firebase Admin SDK JSONファイルをダウンロードして配置:
   - `firebase-adminsdk.json` をこのディレクトリに配置

## Firebase認証の設定

1. [Firebase Console](https://console.firebase.google.com/)でプロジェクトを作成または選択
2. 「Authentication」セクションに移動
3. 「Sign-in method」タブでGoogleログインを有効化
4. 「Project settings」から「Service accounts」タブを選択
5. 「Generate new private key」をクリックしてサービスアカウントキーをダウンロード
6. ダウンロードしたJSONファイルを `firebase-adminsdk.json` としてサーバーディレクトリに配置

## クライアント側Firebase設定

1. Firebase Consoleの「Project settings」に移動
2. 「Your apps」セクションで「Add app」をクリック（Webアプリ）
3. アプリを登録し、Firebaseの設定情報を取得
4. クライアントプロジェクトの `.env` ファイルに以下の情報を設定:

