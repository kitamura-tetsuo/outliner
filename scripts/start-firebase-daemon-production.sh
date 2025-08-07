#!/bin/bash

# Firebase Emulator デーモン起動スクリプト（Production Cloud Backend用）
# Firebase Functionsエミュレーターのみを起動し、Firebase Authエミュレーターは使用しない

set -e

FIREBASE_PID_FILE="/tmp/firebase-emulator-production.pid"
FIREBASE_LOG_FILE="/tmp/firebase-emulator-production.log"

echo "Starting Firebase Emulator as daemon (Production mode)..."

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

# Firebase Authエミュレーターを無効にする
unset FIREBASE_AUTH_EMULATOR_HOST

# Firebase Emulatorをデーモンとして起動（Firebase FunctionsとHostingのみ）
# disownを使用してプロセスを完全に独立させる
(
    firebase emulators:start --only functions,hosting --project outliner-d57b0 > "$FIREBASE_LOG_FILE" 2>&1 &
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
