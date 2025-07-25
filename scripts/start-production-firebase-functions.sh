#!/bin/bash

# Production Cloud Backend用Firebase Functions Emulatorを起動するスクリプト

set -e

echo "Starting Firebase Functions Emulator for Production Cloud Backend..."

# プロジェクトルートに移動
cd "$(dirname "$0")/.."

# Firebase Functionsエミュレーターを起動
# プロダクション環境の設定を使用
firebase emulators:start --only functions --project outliner-d57b0 --port 57000
