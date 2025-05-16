#!/bin/bash
# This script initializes the Firebase emulators and creates test users

# Start Firebase emulators in the background
firebase emulators:start --project demo-test \
    --only auth,firestore,functions,hosting \
    --import=/firebase-data \
    --export-on-exit=/firebase-data &

# Give emulators time to start up
echo "Waiting for Firebase emulators to start..."
sleep 10

# Install dependencies for test user creation
cd /firebase/scripts
npm install --no-save firebase-admin dotenv

# Create test user
echo "Creating test user in Auth emulator..."
node /firebase/scripts/create-test-user.js

# Keep container running with the emulators
wait