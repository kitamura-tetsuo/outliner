#!/bin/bash

# For Localhost Debug Server  
# ポート7091でデバッグサーバーを起動

echo "Starting Localhost Debug Server on port 7091..."

# ログディレクトリを作成
mkdir -p /workspace/server/logs

# サーバーディレクトリに移動
cd /workspace/server

# 環境変数を設定
export PORT=7091

# デバッグサーバーを起動（ログ出力付き）
npx dotenv-cli -e .env.localhost.test -- npm --experimental-network-inspection run dev -- --host 0.0.0.0 --port 7091 2>&1 | tee /workspace/server/logs/test-auth-service-tee.log
