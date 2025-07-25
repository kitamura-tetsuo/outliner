#!/bin/bash

# Firebase Emulator デーモン起動スクリプト
# VSCodeのタスクから独立してFirebase Emulatorを起動

set -e

FIREBASE_PID_FILE="/tmp/firebase-emulator.pid"
FIREBASE_LOG_FILE="/tmp/firebase-emulator.log"

echo "Starting Firebase Emulator as daemon..."

# 既存のプロセスを停止
pkill -f "firebase emulators.*outliner-d57b0" || true
sleep 3

# PIDファイルをクリア
rm -f "$FIREBASE_PID_FILE"

# Azure環境変数を設定
export AZURE_TENANT_ID=89b298bd-9aa3-4a6b-8ef0-2dc3019b0996
export AZURE_ENDPOINT=https://us.fluidrelay.azure.com
export AZURE_PRIMARY_KEY=AOPktmYTWatr1dnpTYlzKtwJdnH2JvetxZtvHVAenjoeQQGig58SJQQJ99BDACRsaBGy71xuAAAAAZFRCYsB
export AZURE_SECONDARY_KEY=G1uCB4aPknENH7HVHBwkd5lnUjrov8ZfejV2ieeUeaK0gZMuh6plJQQJ99BDACRsaBGy71xuAAAAAZFR25QJ
export AZURE_ACTIVE_KEY=primary

# Firebase Emulatorをデーモンとして起動
# disownを使用してプロセスを完全に独立させる
(
    firebase emulators:start --project outliner-d57b0 > "$FIREBASE_LOG_FILE" 2>&1 &
    FIREBASE_PID=$!
    echo $FIREBASE_PID > "$FIREBASE_PID_FILE"
    echo "Firebase Emulator started as daemon with PID: $FIREBASE_PID"
    disown
) &

# 起動を待つ
sleep 15

# プロセスが正常に起動したか確認
if [ -f "$FIREBASE_PID_FILE" ]; then
    FIREBASE_PID=$(cat "$FIREBASE_PID_FILE")
    if kill -0 $FIREBASE_PID 2>/dev/null; then
        echo "Firebase Emulator daemon started successfully (PID: $FIREBASE_PID)"
        echo "Log file: $FIREBASE_LOG_FILE"
        exit 0
    else
        echo "ERROR: Firebase Emulator daemon failed to start"
        exit 1
    fi
else
    echo "ERROR: PID file not created"
    exit 1
fi
