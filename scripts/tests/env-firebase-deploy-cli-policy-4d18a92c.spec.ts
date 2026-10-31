import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const expected = readFileSync(resolve(root, ".firebase-tools-version"), "utf8").trim();

describe("Firebase production deploy CLI policy", () => {
    test("a clean deploy installs the declared CLI and deploys through the version-checking wrapper", () => {
        const fixture = mkdtempSync(resolve(tmpdir(), "firebase-deploy-policy-"));
        const bin = resolve(fixture, "bin");
        const invocationLog = resolve(fixture, "invocations.log");
        mkdirSync(bin);
        mkdirSync(resolve(fixture, "client"));
        mkdirSync(resolve(fixture, "functions"));
        mkdirSync(resolve(fixture, "scripts"));

        cpSync(resolve(root, "deploy-to-firebase.sh"), resolve(fixture, "deploy-to-firebase.sh"));
        cpSync(resolve(root, "scripts/firebase-cli.sh"), resolve(fixture, "scripts/firebase-cli.sh"));
        cpSync(resolve(root, ".firebase-tools-version"), resolve(fixture, ".firebase-tools-version"));
        writeFileSync(resolve(fixture, "client/.env.firebase"), "TEST_ONLY=1\n");

        const npm = resolve(bin, "npm");
        writeFileSync(
            npm,
            `#!/bin/sh
set -eu
printf 'npm:%s\\n' "$*" >> "$INVOCATION_LOG"
if [ "$*" = 'install --global firebase-tools@${expected}' ]; then
  cat > "$FIREBASE_TEST_BIN/firebase" <<'EOF'
#!/bin/sh
if [ "\${1:-}" = "--version" ]; then
  echo "${expected}"
else
  printf 'firebase:%s\\n' "$*" >> "$INVOCATION_LOG"
fi
EOF
  chmod +x "$FIREBASE_TEST_BIN/firebase"
fi
`,
        );
        chmodSync(npm, 0o755);

        const result = spawnSync("bash", ["deploy-to-firebase.sh"], {
            cwd: fixture,
            encoding: "utf8",
            env: {
                ...process.env,
                FIREBASE_TEST_BIN: bin,
                INVOCATION_LOG: invocationLog,
                PATH: `${bin}:${process.env.PATH}`,
            },
        });

        expect(result.status, result.stderr).toBe(0);
        expect(result.stderr).toContain(`Firebase CLI version: ${expected}`);
        expect(readFileSync(invocationLog, "utf8")).toContain(
            `npm:install --global firebase-tools@${expected}`,
        );
        expect(readFileSync(invocationLog, "utf8")).toContain("firebase:deploy");

        const deployScript = readFileSync(resolve(root, "deploy-to-firebase.sh"), "utf8");
        expect(deployScript).not.toContain("firebase.tools");
        expect(deployScript).toContain('npm install --global "firebase-tools@${FIREBASE_TOOLS_VERSION}"');
        expect(deployScript).toContain("scripts/firebase-cli.sh deploy");
    });
});
