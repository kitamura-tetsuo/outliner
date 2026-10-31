#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/require-java-21.sh"

# Redirect all output to a log file for debugging (optional/redundant with PM2 but safe)
# exec > >(tee -a /workspace/logs/firebase-emulators-wrapper.log) 2>&1

# Print versions
node --version
"${SCRIPT_DIR}/firebase-cli.sh" --version

echo "Starting Firebase Emulators..."
# We use exec to replace the shell process with firebase, ensuring signals are propagated
exec "${SCRIPT_DIR}/firebase-cli.sh" emulators:start \
    --only auth,firestore,functions,hosting,storage \
    --config firebase.emulator.json \
    --project outliner-d57b0
