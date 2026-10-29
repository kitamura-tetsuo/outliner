import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const expected = manifest.devDependencies["firebase-tools"];

describe("Firebase CLI version policy", () => {
    test("the checked-in CLI wrapper resolves the exact lockfile-managed version", () => {
        expect(expected).toMatch(/^\d+\.\d+\.\d+$/);
        const output = execFileSync(resolve(root, "scripts/firebase-cli.sh"), ["--version"], {
            cwd: root,
            encoding: "utf8",
        }).trim();
        expect(output).toBe(expected);
    });

    test("the wrapper fails visibly when installed CLI metadata disagrees", () => {
        const command = readFileSync(resolve(root, "scripts/firebase-cli.sh"), "utf8")
            .replace(
                'ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"',
                `ROOT_DIR="${root}"`,
            )
            .replace(
                "node_modules/firebase-tools/package.json",
                "scripts/tests/fixtures/firebase-tools-mismatch/package.json",
            )
            .replace(
                "node_modules/firebase-tools/lib/bin/firebase.js",
                "scripts/tests/fixtures/firebase-tools-mismatch/firebase.js",
            );
        const result = spawnSync("bash", ["-c", command], { cwd: root, encoding: "utf8" });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(`requires ${expected}, but node_modules contains 0.0.0`);
    });

    test("emulator, E2E, validation, and deploy entry points use the policy", () => {
        for (
            const path of [
                "scripts/start-firebase-emulators.sh",
                ".github/actions/setup-e2e-deps/action.yml",
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
