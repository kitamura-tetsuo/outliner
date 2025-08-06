#!/bin/bash

# Azure Fluid Relay設定を更新するスクリプト
# 使用方法: ./scripts/update-azure-secrets.sh

set -e

echo "Azure Fluid Relay シークレットを更新します..."

# 必要な環境変数をチェック
if [ -z "$AZURE_TENANT_ID" ] || [ -z "$AZURE_PRIMARY_KEY" ] || [ -z "$AZURE_SECONDARY_KEY" ] || [ -z "$AZURE_ENDPOINT" ]; then
    echo "エラー: 必要な環境変数が設定されていません。"
    echo "以下の環境変数を設定してください:"
    echo "  AZURE_TENANT_ID"
    echo "  AZURE_PRIMARY_KEY"
    echo "  AZURE_SECONDARY_KEY"
    echo "  AZURE_ENDPOINT"
    echo "  AZURE_ACTIVE_KEY (オプション、デフォルト: primary)"
    exit 1
fi

# デフォルト値を設定
AZURE_ACTIVE_KEY=${AZURE_ACTIVE_KEY:-"primary"}

echo "Firebase Functions シークレットを設定中..."

# 改行文字を除去してシークレットを設定
printf "%s" "$AZURE_TENANT_ID" | firebase functions:secrets:set AZURE_TENANT_ID --project outliner-d57b0 --data-file=-
printf "%s" "$AZURE_PRIMARY_KEY" | firebase functions:secrets:set AZURE_PRIMARY_KEY --project outliner-d57b0 --data-file=-
printf "%s" "$AZURE_SECONDARY_KEY" | firebase functions:secrets:set AZURE_SECONDARY_KEY --project outliner-d57b0 --data-file=-
printf "%s" "$AZURE_ENDPOINT" | firebase functions:secrets:set AZURE_ENDPOINT --project outliner-d57b0 --data-file=-
printf "%s" "$AZURE_ACTIVE_KEY" | firebase functions:secrets:set AZURE_ACTIVE_KEY --project outliner-d57b0 --data-file=-

echo "シークレットの設定が完了しました。"

echo "Firebase Functions をデプロイ中..."
firebase deploy --only functions --project outliner-d57b0

echo "Azure設定の更新が完了しました。"
echo "Azure health check を実行して設定を確認してください:"
echo "curl -X GET 'https://outliner-d57b0.web.app/api/azure-health-check'"
