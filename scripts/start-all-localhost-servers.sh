#!/bin/bash

# 全てのLocalhostサーバーを起動するスクリプト
# VSCodeのlaunch.jsonの"Localhost Test Servers with Firebase Functions"に対応

echo "Starting all Localhost servers..."

# スクリプトディレクトリのパス
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 各サーバーをバックグラウンドで起動
echo "Starting SvelteKit Server..."
bash "$SCRIPT_DIR/start-localhost-sveltekit-server.sh" &
SVELTEKIT_PID=$!

echo "Starting Debug Server..."
bash "$SCRIPT_DIR/start-localhost-debug-server.sh" &
DEBUG_SERVER_PID=$!

echo "Starting Tinylicious..."
bash "$SCRIPT_DIR/start-localhost-tinylicious.sh" &
TINYLICIOUS_PID=$!

echo "Starting Firebase Functions..."
bash "$SCRIPT_DIR/start-localhost-firebase-functions.sh" &
FIREBASE_PID=$!

echo "All servers started!"
echo "SvelteKit Server PID: $SVELTEKIT_PID"
echo "Debug Server PID: $DEBUG_SERVER_PID"
echo "Tinylicious PID: $TINYLICIOUS_PID"
echo "Firebase Functions PID: $FIREBASE_PID"

echo ""
echo "Servers are running on:"
echo "- SvelteKit Server: http://localhost:7090"
echo "- Debug Server: http://localhost:7091"
echo "- Tinylicious: http://localhost:7092"
echo "- Firebase Functions: (check Firebase emulator output)"

echo ""
echo "Press Ctrl+C to stop all servers"

# シグナルハンドラーを設定してすべてのプロセスを終了
trap 'echo "Stopping all servers..."; kill $SVELTEKIT_PID $DEBUG_SERVER_PID $TINYLICIOUS_PID $FIREBASE_PID 2>/dev/null; exit' INT TERM

# すべてのプロセスが終了するまで待機
wait
