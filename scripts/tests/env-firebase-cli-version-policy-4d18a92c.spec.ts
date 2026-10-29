import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
});
