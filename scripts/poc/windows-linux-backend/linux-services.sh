#!/usr/bin/env bash
set -euo pipefail
cd /app
mkdir -p /evidence data
node scripts/setup-emulator-config.js
node /harness/scripts/poc/windows-native-ime/configure-app.mjs /app
node --input-type=module - <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'firebase.emulator.json';
const config = JSON.parse(readFileSync(p));
for (const name of ['auth', 'firestore', 'functions', 'hosting']) config.emulators[name].host = '0.0.0.0';
writeFileSync(p, JSON.stringify(config, null, 2));
JS
export NODE_ENV=test TEST_ENV=localhost ALLOW_TEST_ACCESS=true
export FIREBASE_PROJECT_ID=outliner-d57b0 GCLOUD_PROJECT=outliner-d57b0
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:59099 FIRESTORE_EMULATOR_HOST=127.0.0.1:58080
export PORT=7093 ORIGIN_ALLOWLIST=http://127.0.0.1:7090 FIREBASE_HOSTING_PORT=57070
export CI=true E2E_DISABLE_WATCH=1 E2E_DISABLE_HMR=0
node /opt/tools/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --only auth,firestore,functions,hosting --project outliner-d57b0 --config firebase.emulator.json > /evidence/firebase.stdout.txt 2> /evidence/firebase.stderr.txt &
firebase_pid=$!
node server/dist/server/src/index.js > /evidence/yjs.stdout.txt 2> /evidence/yjs.stderr.txt &
yjs_pid=$!
(cd client && NODE_ENV=development exec node node_modules/vite/bin/vite.js dev --config vite.config.ts --mode test --host 0.0.0.0 --port 7090 --strictPort) > /evidence/client.stdout.txt 2> /evidence/client.stderr.txt &
client_pid=$!
trap 'kill "$firebase_pid" "$yjs_pid" "$client_pid" 2>/dev/null || true' EXIT INT TERM
# Any service exiting fails the container instead of leaving a partial backend alive.
set +e
wait -n "$firebase_pid" "$yjs_pid" "$client_pid"
status=$?
set -e
printf 'A required Linux service exited with status %s\n' "$status" >&2
exit 1
