#!/usr/bin/env bash
set -euo pipefail
candidate=${1:?candidate checkout required}
name=node26-server-candidate
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
for variant in production debug; do
  if [ "$variant" = production ]; then
    dockerfile="$candidate/server/Dockerfile"
  else
    dockerfile="$candidate/server/Dockerfile.debug"
  fi
  image="node26-server-candidate:$variant"
  docker build --file "$dockerfile" --tag "$image" "$candidate"
  docker run --rm --network none --workdir /usr/src/app \
    --mount "type=bind,src=$candidate/scripts/ci/node26-data-smoke.mjs,dst=/tmp/node26-data-smoke.mjs,readonly" \
    "$image" node /tmp/node26-data-smoke.mjs
  docker run --rm --network none --workdir /usr/src/app/server "$image" node -e '
    const assert = require("node:assert/strict");
    assert.equal(process.versions.node, "26.13.0");
    const admin = require("firebase-admin");
    const { getFirestore, FieldValue } = require("firebase-admin/firestore");
    admin.initializeApp({ projectId: "dummy-project" });
    getFirestore().collection("dummy").doc("dummy-id");
    FieldValue.serverTimestamp();
    const fs = require("node:fs");
    const a = JSON.parse(fs.readFileSync("node_modules/firebase-admin/package.json", "utf8")).version.split(".").map(Number);
    const f = JSON.parse(fs.readFileSync("node_modules/@google-cloud/firestore/package.json", "utf8")).version.split(".").map(Number);
    assert.ok(a[0] === 14 && a[1] >= 4);
    assert.ok(f[0] === 9 && f[1] >= 2);
  '
  # The debug image's default command starts SSH. Exercise its compiled server
  # directly without changing SSH configuration or starting an SSH service.
  command=()
  if [ "$variant" = debug ]; then command=(node server/dist/server/src/index.js); fi
  docker run -d --name "$name" \
    -e ALLOW_ALL_ORIGINS=true -e DISABLE_JOB_SCHEDULER=true \
    -e FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:59099 \
    -e FIRESTORE_EMULATOR_HOST=127.0.0.1:58080 \
    -e FIREBASE_PROJECT_ID=outliner-d57b0 \
    -e VITE_FIREBASE_API_KEY=emulator-key \
    -e VITE_FIREBASE_AUTH_DOMAIN=outliner-d57b0.firebaseapp.com \
    -e VITE_FIREBASE_PROJECT_ID=outliner-d57b0 \
    -e VITE_FIREBASE_APP_ID=1:0:web:emulator \
    -e OAUTH_ACCESS_TOKEN_SECRET=container-smoke-secret \
    -e OAUTH_ISSUER=http://127.0.0.1:7093 \
    "$image" "${command[@]}"
  ready=0
  for attempt in $(seq 1 30); do
    if docker exec "$name" node -e '
      const assert = require("node:assert/strict");
      const fs = require("node:fs");
      assert.equal(process.versions.node, "26.13.0");
      assert.equal(fs.realpathSync("/proc/1/exe"), fs.realpathSync(process.execPath));
      (async () => {
        const health = await fetch("http://127.0.0.1:7093/health");
        assert.ok(health.ok, `health status ${health.status}`);
        const deployment = await fetch("http://127.0.0.1:7093/api/deployment");
        assert.ok(deployment.ok, `deployment status ${deployment.status}`);
        assert.equal((await deployment.json()).deploymentMode, "cloud");
      })().catch(error => { console.error(error); process.exitCode = 1; });
    '; then ready=1; break; fi
    if [ "$(docker inspect -f '{{.State.Running}}' "$name")" != true ]; then break; fi
    sleep 1
  done
  if [ "$ready" != 1 ]; then docker logs "$name"; exit 1; fi
  cleanup
done
