#!/bin/bash

# For Localhost SvelteKit Server
# ポート7090でSvelteKitサーバーを起動

echo "Starting Localhost SvelteKit Server on port 7090..."

# ログディレクトリを作成
mkdir -p /workspace/server/logs

# クライアントディレクトリに移動
cd /workspace/client

# 環境変数を設定
export PORT=7090

# SvelteKitサーバーを起動（ログ出力付き）
npx dotenv-cli -e .env.localhost.test -- npm --experimental-network-inspection run dev -- --host 0.0.0.0 --port 7090 2>&1 | tee /workspace/server/logs/test-svelte-kit.log
