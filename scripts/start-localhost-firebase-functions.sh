#!/bin/bash

# For Localhost Debug Firebase Functions
# Firebaseエミュレーターを起動

echo "Starting Localhost Firebase Functions Emulator..."

# ワークスペースルートに移動
cd /workspace

# 環境変数を設定
export FIREBASE_DEBUG_MODE=true

# Firebaseエミュレーターを起動（デバッグモード）
firebase emulators:start --inspect-functions=9229 --project outliner-d57b0
