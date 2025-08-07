#!/bin/bash

# Firebase Emulator状態確認スクリプト
# VSCodeのpreLaunchTaskで使用

set -e

FIREBASE_PID_FILE="/tmp/firebase-emulator.pid"
MAX_WAIT=30
WAIT_COUNT=0

echo "Checking Firebase Emulator status..."

# Firebase Emulatorが起動しているかチェック
check_firebase_emulator() {
    # HTTPエンドポイントをチェック
    if curl -s http://localhost:57000/api/health > /dev/null 2>&1; then
        echo "Firebase Emulator is running and responding"
        return 0
    else
        return 1
    fi
}

# Firebase Emulatorが起動していない場合は起動
if ! check_firebase_emulator; then
    echo "Firebase Emulator is not running, starting daemon..."
    /home/ubuntu/src/outliner/scripts/start-firebase-daemon.sh
    
    # 起動を待つ
    while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
        if check_firebase_emulator; then
            echo "Firebase Emulator is now ready"
            exit 0
        fi
        
        echo "Waiting for Firebase Emulator to start... ($WAIT_COUNT/$MAX_WAIT)"
        sleep 2
        WAIT_COUNT=$((WAIT_COUNT + 1))
    done
    
    echo "ERROR: Firebase Emulator failed to start within $MAX_WAIT attempts"
    exit 1
else
    echo "Firebase Emulator is already running"
    exit 0
fi
