# 本番環境セットアップガイド

## 必要なGitHub Secrets

本番環境でアプリケーションを正常に動作させるために、以下のGitHub Secretsを設定する必要があります。

### Azure Fluid Relay設定

1. **AZURE_TENANT_ID**
   - Azure Fluid RelayのテナントID
   - 例: `your-production-tenant-id`

2. **AZURE_ENDPOINT**
   - Azure Fluid Relayのエンドポイント
   - 例: `https://your-production-endpoint.fluidrelay.azure.com`

3. **AZURE_PRIMARY_KEY**
   - Azure Fluid Relayのプライマリキー
   - 例: `your-production-primary-key`

4. **AZURE_SECONDARY_KEY**
   - Azure Fluid Relayのセカンダリキー
   - 例: `your-production-secondary-key`

5. **AZURE_ACTIVE_KEY**
   - 使用するキー（"primary" または "secondary"）
   - 通常は `primary`

### Firebase設定

6. **FIREBASE_API_KEY**
   - FirebaseプロジェクトのAPIキー

7. **FIREBASE_TOKEN**
   - Firebase CLIのデプロイ用トークン

## 現在の問題

本番環境で以下のエラーが発生しています：

```
[HTTP/1.1 401] /api/fluid-token
[ERROR]: Fluid token request failed: 401 {"error":"Authentication failed"}
[ERROR]: R11s fetch error: {"message":"Invalid token validated with key2.","canRetry":false,"isFatal":false}
```

### 考えられる原因

1. **Azure設定の不備**: GitHub SecretsのAzure設定が正しくない
2. **キーの不一致**: Azure Fluid Relayで設定されているキーとGitHub Secretsのキーが一致していない
3. **テナントIDの不一致**: Azure Fluid RelayのテナントIDが正しくない

### 解決手順

1. Azure Portalでfluid Relayサービスの設定を確認
2. GitHub SecretsのAzure設定を正しい値に更新
3. デプロイを実行して設定を反映
4. Firebase Functionsのログを確認して問題が解決されたかチェック

### ログの確認方法

Firebase Functionsのログは以下のコマンドで確認できます：

```bash
firebase functions:log --project outliner-d57b0
```

または、Firebase Consoleの「Functions」セクションでログを確認できます。

## トラブルシューティング

### 401エラーが続く場合

1. Firebase Authenticationが正しく設定されているか確認
2. クライアント側のFirebase設定が正しいか確認
3. IDトークンが正しく送信されているか確認

### 403エラー（Invalid token）が続く場合

1. Azure Fluid RelayのキーがGitHub Secretsと一致しているか確認
2. テナントIDが正しいか確認
3. Azure Fluid Relayサービスが有効になっているか確認
