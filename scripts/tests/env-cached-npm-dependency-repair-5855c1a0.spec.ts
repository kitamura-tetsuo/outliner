import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, test } from "vitest";

/** @feature ENV-5855c1a0
 *  Title   : Cached npm dependency repair
 *  Source  : docs/dev-features/ci-cached-npm-dependency-repair-5855c1a0.yaml
 */

const repoRoot = path.resolve(import.meta.dirname, "../..");
const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

function runDependencyCheck(options: { cached: boolean; lsExit?: number; installExit?: number; }) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "outliner-npm-cache-"));
    temporaryDirectories.push(directory);
    const bin = path.join(directory, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(directory, "package-lock.json"), "{}\n");
    if (options.cached) fs.mkdirSync(path.join(directory, "node_modules"));

    const npm = path.join(bin, "npm");
    fs.writeFileSync(
        npm,
        `#!/bin/sh
echo "$*" >> "$NPM_CALLS"
if [ "$1" = ls ]; then
  echo "npm error invalid: expected-dependency" >&2
  exit "${options.lsExit ?? 0}"
fi
if [ "$1" = install ]; then exit "${options.installExit ?? 0}"; fi
exit 0
`,
        { mode: 0o755 },
    );

    const calls = path.join(directory, "npm-calls.log");
    const result = spawnSync(
        "bash",
        ["-c", `source "${path.join(repoRoot, "scripts/common-functions.sh")}"; cd "$TARGET"; npm_ci_if_needed`],
        {
            encoding: "utf8",
            env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TARGET: directory, NPM_CALLS: calls },
        },
    );
    return {
        ...result,
        calls: fs.existsSync(calls) ? fs.readFileSync(calls, "utf8").trim().split("\n") : [],
    };
}

describe("npm_ci_if_needed", () => {
    test("keeps a valid cached dependency tree unchanged", () => {
        const result = runDependencyCheck({ cached: true });
        expect(result.status).toBe(0);
        expect(result.calls).toEqual(["ls"]);
    });

    test("repairs an invalid cached tree in place and retains the diagnostic", () => {
        const result = runDependencyCheck({ cached: true, lsExit: 1 });
        expect(result.status).toBe(0);
        expect(result.calls).toEqual(["ls", "install"]);
        expect(result.calls).not.toContain("ci");
        expect(result.stdout).toContain("npm error invalid: expected-dependency");
    });

    test("uses the clean lockfile install for a missing tree", () => {
        const result = runDependencyCheck({ cached: false });
        expect(result.status).toBe(0);
        expect(result.calls).toEqual(["ci"]);
    });

    test("propagates a failed cached-tree repair", () => {
        const result = runDependencyCheck({ cached: true, lsExit: 1, installExit: 23 });
        expect(result.status).toBe(23);
        expect(result.calls).toEqual(["ls", "install"]);
    });
});
