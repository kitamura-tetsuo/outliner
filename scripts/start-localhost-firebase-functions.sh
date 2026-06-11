#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load common configuration and functions
source "${SCRIPT_DIR}/common-config.sh"
source "${SCRIPT_DIR}/common-functions.sh"

# Set debug mode
export FIREBASE_DEBUG_MODE=true

# Start Firebase emulator with debug mode
echo "Starting Firebase Functions Emulator with debug mode..."
cd "${ROOT_DIR}/firebase"
firebase emulators:start --inspect-functions=9229 --project ${FIREBASE_PROJECT_ID}
