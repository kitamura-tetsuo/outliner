#!/bin/bash

# Firebase Emulator監視・自動再起動スクリプト

set -e

FIREBASE_PID_FILE="/tmp/firebase-emulator.pid"
FIREBASE_LOG_FILE="/tmp/firebase-emulator.log"
MONITOR_INTERVAL=30  # 30秒間隔でチェック

# Azure環境変数を設定
export AZURE_TENANT_ID=89b298bd-9aa3-4a6b-8ef0-2dc3019b0996
export AZURE_ENDPOINT=https://us.fluidrelay.azure.com
export AZURE_PRIMARY_KEY=AOPktmYTWatr1dnpTYlzKtwJdnH2JvetxZtvHVAenjoeQQGig58SJQQJ99BDACRsaBGy71xuAAAAAZFRCYsB
export AZURE_SECONDARY_KEY=G1uCB4aPknENH7HVHBwkd5lnUjrov8ZfejV2ieeUeaK0gZMuh6plJQQJ99BDACRsaBGy71xuAAAAAZFR25QJ
export AZURE_ACTIVE_KEY=primary

start_firebase_emulator() {
    echo "Starting Firebase Emulator..."
    
    # 既存のプロセスを停止
    pkill -f "firebase emulators.*outliner-d57b0" || true
    sleep 3
    
    # Firebase Emulatorを起動
    firebase emulators:start --project outliner-d57b0 > "$FIREBASE_LOG_FILE" 2>&1 &
    FIREBASE_PID=$!
    
    # PIDを保存
    echo $FIREBASE_PID > "$FIREBASE_PID_FILE"
    
    echo "Firebase Emulator started with PID: $FIREBASE_PID"
    echo "Log file: $FIREBASE_LOG_FILE"
    
    # 起動を待つ
    sleep 15
    
    # プロセスが生きているか確認
    if kill -0 $FIREBASE_PID 2>/dev/null; then
        echo "Firebase Emulator startup completed successfully"
        return 0
    else
        echo "ERROR: Firebase Emulator failed to start"
        return 1
    fi
}

check_firebase_emulator() {
    # PIDファイルが存在するかチェック
    if [ ! -f "$FIREBASE_PID_FILE" ]; then
        return 1
    fi
    
    # PIDを読み取り
    FIREBASE_PID=$(cat "$FIREBASE_PID_FILE")
    
    # プロセスが生きているかチェック
    if kill -0 $FIREBASE_PID 2>/dev/null; then
        # HTTPエンドポイントもチェック
        if curl -s http://localhost:57000/api/health > /dev/null 2>&1; then
            return 0
        else
            echo "Firebase Emulator process is running but HTTP endpoint is not responding"
            return 1
        fi
    else
        echo "Firebase Emulator process is not running"
        return 1
    fi
}

# メイン監視ループ
echo "Starting Firebase Emulator monitor..."

# 初回起動
if ! start_firebase_emulator; then
    echo "Failed to start Firebase Emulator initially"
    exit 1
fi

# 監視ループ
while true; do
    sleep $MONITOR_INTERVAL
    
    if ! check_firebase_emulator; then
        echo "Firebase Emulator is down, restarting..."
        if start_firebase_emulator; then
            echo "Firebase Emulator restarted successfully"
        else
            echo "Failed to restart Firebase Emulator"
            exit 1
        fi
    else
        echo "Firebase Emulator is running normally"
    fi
done
