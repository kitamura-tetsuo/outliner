#!/bin/bash

# Production Firebase Emulators起動スクリプト

set -e

echo "Stopping existing Firebase Emulators..."
pkill -f "firebase emulators.*outliner-d57b0" || true

echo "Waiting for processes to stop..."
sleep 3

echo "Starting Production Firebase Emulators..."

# Azure環境変数を設定
export AZURE_TENANT_ID=89b298bd-9aa3-4a6b-8ef0-2dc3019b0996
export AZURE_ENDPOINT=https://us.fluidrelay.azure.com
export AZURE_PRIMARY_KEY=AOPktmYTWatr1dnpTYlzKtwJdnH2JvetxZtvHVAenjoeQQGig58SJQQJ99BDACRsaBGy71xuAAAAAZFRCYsB
export AZURE_SECONDARY_KEY=G1uCB4aPknENH7HVHBwkd5lnUjrov8ZfejV2ieeUeaK0gZMuh6plJQQJ99BDACRsaBGy71xuAAAAAZFR25QJ
export AZURE_ACTIVE_KEY=primary

# Firebase Emulatorをバックグラウンドで起動
echo "Starting Firebase Emulators with nohup..."
nohup firebase emulators:start --project outliner-d57b0 > /tmp/firebase-emulator.log 2>&1 &
FIREBASE_PID=$!

echo "Firebase Emulators starting in background (PID: $FIREBASE_PID)..."
echo "Log file: /tmp/firebase-emulator.log"

# 起動を待つ
echo "Waiting for Firebase Emulators to start..."
sleep 15

# プロセスが生きているか確認
if kill -0 $FIREBASE_PID 2>/dev/null; then
    echo "Firebase Emulators startup completed successfully (PID: $FIREBASE_PID)"
else
    echo "ERROR: Firebase Emulators failed to start"
    echo "Last 20 lines of log:"
    tail -20 /tmp/firebase-emulator.log
    exit 1
fi
