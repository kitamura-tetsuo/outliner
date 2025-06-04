#!/bin/bash

# For Localhost Launch Tinylicious
# ポート7092でTinyliciousサーバーを起動

echo "Starting Localhost Tinylicious Server on port 7092..."

# クライアントディレクトリに移動
cd /workspace/client

# 環境変数を設定
export PORT=7092

# Tinyliciousサーバーを起動
npx tinylicious
