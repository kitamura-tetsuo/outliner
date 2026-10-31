import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const expected = readFileSync(resolve(root, ".firebase-tools-version"), "utf8").trim();

describe("Firebase CLI version policy", () => {
    test("the checked-in CLI wrapper resolves the declared version", () => {
        expect(expected).toMatch(/^\d+\.\d+\.\d+$/);
        const bin = mkdtempSync(resolve(tmpdir(), "firebase-cli-match-"));
        const fakeFirebase = resolve(bin, "firebase");
        writeFileSync(fakeFirebase, `#!/bin/sh\necho "${expected}"\n`);
        chmodSync(fakeFirebase, 0o755);
        const output = execFileSync(resolve(root, "scripts/firebase-cli.sh"), ["--version"], {
            cwd: root,
            encoding: "utf8",
            env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
        }).trim();
        expect(output).toBe(expected);
    });

    test("the wrapper preserves a spaced executable path and emulator arguments", () => {
        const parent = mkdtempSync(resolve(tmpdir(), "firebase cli match-"));
        const bin = resolve(parent, "bin with spaces");
        const invocation = resolve(parent, "invocation.txt");
        const fakeFirebase = resolve(bin, "firebase");
        mkdirSync(bin);
        writeFileSync(
            fakeFirebase,
            `#!/bin/sh
if [ "\${1:-}" = "--version" ]; then
  echo "${expected}"
else
  printf '%s\\n' "$@" > "$FIREBASE_INVOCATION"
fi
`,
        );
        chmodSync(fakeFirebase, 0o755);
        const result = spawnSync(
            resolve(root, "scripts/firebase-cli.sh"),
            ["emulators:start", "--project", "demo-project"],
            {
                cwd: root,
                encoding: "utf8",
                env: {
                    ...process.env,
                    FIREBASE_INVOCATION: invocation,
                    PATH: `${bin}:${process.env.PATH}`,
                },
            },
        );
        expect(result.status, result.stderr).toBe(0);
        expect(result.stderr).toContain(`Firebase CLI version: ${expected}`);
        expect(readFileSync(invocation, "utf8").trim().split("\n")).toEqual([
            "emulators:start",
            "--project",
            "demo-project",
        ]);
    });

    test("the wrapper fails visibly when PATH contains a different CLI version", () => {
        const bin = mkdtempSync(resolve(tmpdir(), "firebase-cli-mismatch-"));
        const fakeFirebase = resolve(bin, "firebase");
        writeFileSync(fakeFirebase, '#!/bin/sh\necho "0.0.0"\n');
        chmodSync(fakeFirebase, 0o755);
        const result = spawnSync(resolve(root, "scripts/firebase-cli.sh"), ["--version"], {
            cwd: root,
            encoding: "utf8",
            env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
        });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(`policy requires ${expected}, but PATH resolves 0.0.0`);
    });

    test("emulator, E2E, validation, and deploy entry points use the policy", () => {
        for (
            const path of [
                "scripts/start-firebase-emulators.sh",
                ".github/actions/setup-e2e-deps/action.yml",
                ".github/actions/setup-test-env/action.yml",
                ".github/workflows/ci-checks.yml",
                ".github/workflows/deploy.yml",
            ]
        ) {
            expect(readFileSync(resolve(root, path), "utf8"), path).toContain(
                "scripts/firebase-cli.sh".replace("scripts/", path.startsWith("scripts/") ? "" : "scripts/"),
            );
        }
    });

    test("container and Windows boundaries carry the repository policy explicitly", () => {
        const ciImage = readFileSync(resolve(root, ".github/container/Dockerfile"), "utf8");
        expect(ciImage).toContain("WORKDIR /cache\nCOPY .firebase-tools-version ./");

        const windowsWrapper = readFileSync(resolve(root, "scripts/firebase-cli.cmd"), "utf8");
        expect(windowsWrapper).toContain('firebase-cli-windows.cjs" "%~dp0.." %*');
        const windowsLauncher = readFileSync(resolve(root, "scripts/firebase-cli-windows.cjs"), "utf8");
        expect(windowsLauncher).toContain('spawnSync("where.exe", ["firebase.cmd"]');
        expect(windowsLauncher).toContain("spawnSync(process.execPath, [firebaseEntry");

        const functionsPackage = JSON.parse(readFileSync(resolve(root, "functions/package.json"), "utf8"));
        for (const script of ["serve", "shell", "deploy", "logs", "debug"]) {
            expect(functionsPackage.scripts[script], script).toContain("node ../scripts/firebase-cli-npm.cjs");
        }

        const windowsPreparation = readFileSync(
            resolve(root, "scripts/poc/windows-native-ime/prepare-app.ps1"),
            "utf8",
        );
        expect(windowsPreparation).toContain("$harnessRoot/.firebase-tools-version");
        expect(windowsPreparation).toContain("cache contains $installedFirebaseToolsVersion");

        for (
            const path of [
                "scripts/poc/windows-linux-backend/start-compose.ps1",
                "scripts/native-ime-regression/windows/start-backend.ps1",
            ]
        ) {
            const linuxPreparation = readFileSync(resolve(root, path), "utf8");
            expect(linuxPreparation, path).toContain("Get-Content '.firebase-tools-version'");
            expect(linuxPreparation, path).toContain("$sha,$firebaseToolsVersion");
        }
    });
});
