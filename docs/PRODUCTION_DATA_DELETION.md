# 本番環境データ削除機能

本番環境のすべてのデータを安全に削除するための機能とスクリプトです。

## ⚠️ 重要な警告

**この機能は本番環境のすべてのデータを完全に削除します。削除されたデータは復元できません。**

- Firebase Firestore のすべてのコレクション
- Firebase Auth のすべてのユーザー
- Firebase Storage のすべてのファイル

実行前に必ずバックアップを取得してください。

## 機能概要

### 1. Firebase Functions APIエンドポイント

**エンドポイント**: `/api/deleteAllProductionData`

本番環境のデータを削除するためのAPIエンドポイントです。

#### 認証

- **管理者トークン**: `ADMIN_DELETE_ALL_DATA_2024`
- **確認コード**: `DELETE_ALL_PRODUCTION_DATA_CONFIRM`

#### リクエスト例

```bash
curl -X POST https://us-central1-outliner-d57b0.cloudfunctions.net/deleteAllProductionData \
  -H "Content-Type: application/json" \
  -d '{
    "adminToken": "ADMIN_DELETE_ALL_DATA_2024",
    "confirmationCode": "DELETE_ALL_PRODUCTION_DATA_CONFIRM"
  }'
```

#### レスポンス例

```json
{
    "success": true,
    "message": "Production data deletion completed",
    "results": {
        "firestore": {
            "success": true,
            "error": null,
            "deletedCollections": [
                { "name": "users", "count": 150 },
                { "name": "containers", "count": 300 },
                { "name": "projects", "count": 75 }
            ]
        },
        "auth": {
            "success": true,
            "error": null,
            "deletedUsers": 150
        },
        "storage": {
            "success": true,
            "error": null,
            "deletedFiles": 500
        }
    },
    "timestamp": "2024-08-04T12:00:00.000Z"
}
```

### 2. 管理スクリプト

#### 統合管理スクリプト（推奨）

```bash
# ヘルプ表示
node scripts/production-data-manager.js help

# 環境チェック
node scripts/production-data-manager.js check

# データバックアップ
node scripts/production-data-manager.js backup

# データ削除（確認付き）
node scripts/production-data-manager.js delete --confirm

# データ削除（強制実行）
node scripts/production-data-manager.js delete --confirm --force

# 完全ワークフロー（チェック→バックアップ→削除）
node scripts/production-data-manager.js full --confirm
```

#### 個別スクリプト

```bash
# 環境チェック
node scripts/check-production-environment.js

# データバックアップ
node scripts/backup-production-data.js

# データ削除
node scripts/delete-production-data.js --confirm
```

## 安全性機能

### 1. 環境チェック

- 本番環境かどうかの自動判定
- エミュレーター環境の検出
- Firebase Functions/Hosting の接続確認

### 2. バックアップ機能

削除前に以下のデータをバックアップします：

- **Firestore**: 全コレクションのドキュメント
- **Firebase Auth**: 全ユーザー情報
- **Firebase Storage**: ファイルリスト（メタデータ）

バックアップは `backups/production-backup-{timestamp}/` に保存されます。

### 3. 確認機能

- 管理者トークンによる認証
- 確認コードによる二重確認
- 本番環境でのみ実行可能
- インタラクティブな確認プロンプト

## 使用手順

### 推奨手順（統合スクリプト使用）

1. **環境確認**
   ```bash
   node scripts/production-data-manager.js check
   ```

2. **バックアップ作成**
   ```bash
   node scripts/production-data-manager.js backup
   ```

3. **データ削除**
   ```bash
   node scripts/production-data-manager.js delete --confirm
   ```

### ワンステップ実行

```bash
# 全工程を一度に実行（チェック→バックアップ→削除）
node scripts/production-data-manager.js full --confirm
```

## エラーハンドリング

### よくあるエラー

1. **401 Unauthorized**
   - 管理者トークンが間違っている
   - 解決: 正しいトークンを使用

2. **400 Invalid confirmation code**
   - 確認コードが間違っている
   - 解決: 正しい確認コードを使用

3. **400 This endpoint only works in production environment**
   - テスト環境で実行しようとしている
   - 解決: 本番環境で実行

### ログ確認

Firebase Functions のログを確認：

```bash
firebase functions:log --project outliner-d57b0
```

## テスト

テスト環境での動作確認：

```bash
cd scripts
npm test -- tests/production-data-deletion.spec.js tests/environment-check.spec.js
```

## セキュリティ考慮事項

1. **認証トークン**: 管理者トークンは秘匿情報として扱う
2. **アクセス制限**: 本番環境でのみ実行可能
3. **ログ記録**: すべての操作がログに記録される
4. **バックアップ**: 削除前に必ずバックアップを作成

## 復旧手順

データを誤って削除した場合：

1. **バックアップからの復元**
   - `backups/` ディレクトリから最新のバックアップを確認
   - Firebase Console から手動でデータを復元

2. **Firebase プロジェクトの再構築**
   - 必要に応じて新しいFirebaseプロジェクトを作成
   - バックアップデータを使用してデータを復元

## 関連ファイル

- `functions/index.js` - APIエンドポイント実装
- `scripts/production-data-manager.js` - 統合管理スクリプト
- `scripts/delete-production-data.js` - データ削除スクリプト
- `scripts/backup-production-data.js` - バックアップスクリプト
- `scripts/check-production-environment.js` - 環境チェックスクリプト
- `scripts/tests/` - テストファイル

## 注意事項

- この機能は緊急時やプロジェクト終了時にのみ使用してください
- 削除されたデータは復元できません
- 実行前に必ず関係者に確認を取ってください
- バックアップの作成を忘れずに行ってください
