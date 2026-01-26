# GitLab CIでのFirebaseデプロイ設定

このドキュメントでは、GitLab CIを使用してFirebase Hosting + Functionsへのデプロイを自動化する方法について説明します。

## 前提条件

1. GitLabリポジトリが設定されていること
2. Firebaseプロジェクトが作成されていること
3. Firebase CLIがローカルにインストールされていること

## 設定手順

### 1. Firebase CLIトークンの取得

Firebase CLIトークンを取得するには、以下のコマンドを実行します：

```bash
firebase login:ci
```

このコマンドはブラウザを開き、Googleアカウントでの認証を求めます。認証が成功すると、トークンが表示されます。

### 2. GitLab CIの環境変数設定

GitLabプロジェクトの「Settings」→「CI/CD」→「Variables」で以下の環境変数を設定します：

#### Azure Fluid Relay関連の変数

- `AZURE_TENANT_ID`: Azure Fluid RelayのテナントID
- `AZURE_FLUID_RELAY_ENDPOINT`: Azure Fluid RelayのエンドポイントURL
- `AZURE_PRIMARY_KEY`: Azure Fluid Relayのプライマリキー
- `AZURE_SECONDARY_KEY`: Azure Fluid Relayのセカンダリキー（オプション）
- `AZURE_ACTIVE_KEY`: 使用するキー（"primary"または"secondary"）

#### Firebase関連の変数

- `FIREBASE_TOKEN`: Firebase CLIトークン
- `FIREBASE_API_KEY`: Firebaseプロジェクトのウェブ用APIキー
- `FIREBASE_AUTH_DOMAIN`: Firebaseの認証ドメイン（例: `your-project.firebaseapp.com`）
- `FIREBASE_PROJECT_ID`: FirebaseプロジェクトID
- `FIREBASE_STORAGE_BUCKET`: Firebaseストレージバケット（例: `your-project.appspot.com`）
- `FIREBASE_MESSAGING_SENDER_ID`: Firebaseメッセージング送信者ID
- `FIREBASE_APP_ID`: FirebaseアプリID
- `FIREBASE_MEASUREMENT_ID`: Firebase Analyticsの測定ID（例: `G-XXXXXXXXXX`）

これらの変数は全て「Protected」と「Masked」にチェックを入れて保護することをお勧めします。特に`FIREBASE_TOKEN`と`AZURE_PRIMARY_KEY`は機密情報なので、必ずマスクしてください。

### 3. .gitlab-ci.ymlの設定

`.gitlab-ci.yml`ファイルに以下のデプロイステージを追加します：

```yaml
deploy-to-firebase:
    stage: deploy
    image: node:22-slim
    dependencies:
        - e2e-tests # テストジョブが成功した場合のみデプロイを実行
    variables:
        FIREBASE_TOKEN: ${FIREBASE_TOKEN}
        AZURE_TENANT_ID: ${AZURE_TENANT_ID}
        AZURE_FLUID_RELAY_ENDPOINT: ${AZURE_FLUID_RELAY_ENDPOINT}
        AZURE_PRIMARY_KEY: ${AZURE_PRIMARY_KEY}
        AZURE_SECONDARY_KEY: ${AZURE_SECONDARY_KEY}
        AZURE_ACTIVE_KEY: ${AZURE_ACTIVE_KEY}
    before_script:
        - "apt-get update && apt-get install -y curl"
        - "npm install -g firebase-tools"
        - 'echo "CI_PROJECT_DIR: ${CI_PROJECT_DIR}"'
        - "mkdir -p ${CI_PROJECT_DIR}/logs/"
    script:
        # クライアントのビルド
        - "cd ${CI_PROJECT_DIR}/client"
        - "npm ci"
        - 'echo "Creating client .env file..."'
        - |
              cat > .env << EOF
              # Azure Fluid Relay 設定
              VITE_AZURE_TENANT_ID=${AZURE_TENANT_ID}
              VITE_AZURE_FLUID_RELAY_ENDPOINT=${AZURE_FLUID_RELAY_ENDPOINT}
              VITE_USE_FIREBASE_AUTH=true
              VITE_USE_API_AUTH=true

              # 接続サービスの選択
              VITE_USE_TINYLICIOUS=false
              VITE_FORCE_AZURE=true

              # API設定 - Firebase Functionsのエンドポイント
              VITE_API_BASE_URL=https://outliner-d57b0.web.app
              VITE_API_SERVER_URL=https://outliner-d57b0.web.app

              # Fluid Framework Telemetry設定
              VITE_DISABLE_FLUID_TELEMETRY=true

              # Firebase設定
              VITE_FIREBASE_API_KEY=${FIREBASE_API_KEY}
              VITE_FIREBASE_AUTH_DOMAIN=${FIREBASE_AUTH_DOMAIN}
              VITE_FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}
              VITE_FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET}
              VITE_FIREBASE_MESSAGING_SENDER_ID=${FIREBASE_MESSAGING_SENDER_ID}
              VITE_FIREBASE_APP_ID=${FIREBASE_APP_ID}
              VITE_FIREBASE_MEASUREMENT_ID=${FIREBASE_MEASUREMENT_ID}
              EOF
        - "npm run build"

        # Firebase Functionsのビルド
        - "cd ${CI_PROJECT_DIR}/functions"
        - "npm ci"

        # Firebase Functions環境変数ファイルの作成
        - "cd ${CI_PROJECT_DIR}"
        - 'echo "Creating Firebase Functions .env file..."'
        - |
              cat > functions/.env << EOF
              # Azure Fluid Relay設定
              AZURE_TENANT_ID=${AZURE_TENANT_ID}
              AZURE_FLUID_RELAY_ENDPOINT=${AZURE_FLUID_RELAY_ENDPOINT}
              AZURE_PRIMARY_KEY=${AZURE_PRIMARY_KEY}
              AZURE_SECONDARY_KEY=${AZURE_SECONDARY_KEY}
              AZURE_ACTIVE_KEY=${AZURE_ACTIVE_KEY}

              # プロダクション環境設定
              NODE_ENV=production
              EOF

        # Firebaseへのデプロイ
        - 'firebase deploy --token "${FIREBASE_TOKEN}" --non-interactive'
    only:
        - main # mainブランチにプッシュされた場合のみデプロイを実行
```

### 4. ビルド設定の確認

`firebase.json`のhostingセクションと`client/svelte.config.js`のビルド出力先が一致していることを確認します：

- `firebase.json`のhostingセクションで`"public": "build"`が設定されていること
- `client/svelte.config.js`のadapterセクションで`pages: '../build', assets: '../build'`が設定されていること

### 5. デプロイのテスト

設定が完了したら、mainブランチにプッシュしてデプロイが正常に実行されるか確認します。GitLab CIのパイプラインログでデプロイの進行状況を確認できます。

## トラブルシューティング

### デプロイが失敗する場合

1. GitLab CIの環境変数が正しく設定されているか確認
2. Firebase CLIトークンが有効か確認（期限切れの場合は再取得）
3. パイプラインのログを確認して具体的なエラーメッセージを確認

### ビルドは成功するがデプロイが失敗する場合

1. Firebaseプロジェクトの設定を確認
2. `.firebaserc`ファイルで正しいプロジェクトIDが設定されているか確認
3. Firebase Functionsの環境変数が正しく設定されているか確認

## Firebase Functions v2の環境変数について

Firebase Functions v2では、環境変数の設定方法が変更されています。以前のバージョンでは`firebase functions:config:set`コマンドと`functions.config()`を使用していましたが、v2では`.env`ファイルを使用します。

### 環境変数の設定方法

1. **ローカル開発環境**:
   - `.env`ファイルをFunctionsディレクトリに作成
   - 必要な環境変数を`KEY=VALUE`形式で設定

2. **CI/CD環境**:
   - GitLab CIの環境変数を使用して`.env`ファイルを動的に生成
   - デプロイ時に`.env`ファイルが自動的に読み込まれる

3. **本番環境**:
   - Firebase Functionsにデプロイすると、`.env`ファイルの内容が環境変数として設定される

### 環境変数へのアクセス方法

Firebase Functions v2では、`process.env`を使用して環境変数にアクセスします：

```javascript
// 以前のバージョン（v1）
const config = functions.config();
const tenantId = config.azure.tenant_id;

// 新しいバージョン（v2）
const tenantId = process.env.AZURE_TENANT_ID;
```

## 参考リンク

- [Firebase CLI リファレンス](https://firebase.google.com/docs/cli)
- [GitLab CI/CD 環境変数](https://docs.gitlab.com/ee/ci/variables/)
- [Firebase Hosting + Functions デプロイガイド](https://firebase.google.com/docs/hosting/deploying)
- [Firebase Functions v2 環境変数ガイド](https://firebase.google.com/docs/functions/config-env?gen=2nd)
