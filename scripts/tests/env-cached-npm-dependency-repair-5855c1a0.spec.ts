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
const npmEnvironment = {
    ...process.env,
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
};

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

function createPackageTarball(directory: string, version: string, runtime: string) {
    const dependency = path.join(directory, `package-source-${version}`);
    fs.mkdirSync(dependency);
    fs.writeFileSync(
        path.join(dependency, "package.json"),
        JSON.stringify({ name: "expected-dependency", version, main: "index.cjs" }),
    );
    fs.writeFileSync(path.join(dependency, "index.cjs"), `module.exports = ${JSON.stringify(runtime)};\n`);
    const packed = spawnSync("npm", ["pack", "--ignore-scripts", "--pack-destination", directory], {
        cwd: dependency,
        encoding: "utf8",
        env: npmEnvironment,
    });
    expect(packed.status, packed.stderr).toBe(0);
}

function createActualNpmFixture(install: boolean, stale = false) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "outliner-actual-npm-cache-"));
    temporaryDirectories.push(directory);
    createPackageTarball(directory, "2.0.0", "expected-runtime");
    if (stale) createPackageTarball(directory, "1.0.0", "stale-runtime");
    const writeManifest = (version: string) =>
        fs.writeFileSync(
            path.join(directory, "package.json"),
            JSON.stringify({
                name: "dependency-fixture",
                private: true,
                dependencies: { "expected-dependency": `file:./expected-dependency-${version}.tgz` },
            }),
        );
    writeManifest(stale ? "1.0.0" : "2.0.0");

    const prepare = spawnSync("npm", install ? ["install", "--ignore-scripts"] : ["install", "--package-lock-only"], {
        cwd: directory,
        encoding: "utf8",
        env: npmEnvironment,
    });
    expect(prepare.status, prepare.stderr).toBe(0);
    if (stale) {
        writeManifest("2.0.0");
        const updateLock = spawnSync("npm", ["install", "--package-lock-only", "--ignore-scripts"], {
            cwd: directory,
            encoding: "utf8",
            env: npmEnvironment,
        });
        expect(updateLock.status, updateLock.stderr).toBe(0);
        // A copied cache can have no usable hidden lock metadata; npm must then
        // inspect the installed package rather than trusting stale metadata.
        fs.rmSync(path.join(directory, "node_modules/.package-lock.json"), { force: true });
    }
    return directory;
}

function runActualDependencyCheck(directory: string) {
    return spawnSync(
        "bash",
        ["-c", `source "${path.join(repoRoot, "scripts/common-functions.sh")}"; cd "$TARGET"; npm_ci_if_needed`],
        { encoding: "utf8", env: { ...npmEnvironment, TARGET: directory } },
    );
}

function installedDependency(directory: string) {
    const installed = path.join(directory, "node_modules/expected-dependency");
    const packageJson = JSON.parse(fs.readFileSync(path.join(installed, "package.json"), "utf8")) as {
        version: string;
    };
    const runtime = spawnSync("node", ["-e", `process.stdout.write(require(${JSON.stringify(installed)}))`], {
        encoding: "utf8",
    });
    expect(runtime.status, runtime.stderr).toBe(0);
    return { version: packageJson.version, runtime: runtime.stdout };
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

    test("leaves a valid actual npm tree untouched and runnable", () => {
        const directory = createActualNpmFixture(true);
        const marker = path.join(directory, "node_modules/valid-cache-marker");
        fs.writeFileSync(marker, "preserved");

        const result = runActualDependencyCheck(directory);

        expect(result.status, result.stderr).toBe(0);
        expect(fs.readFileSync(marker, "utf8")).toBe("preserved");
        expect(installedDependency(directory)).toEqual({ version: "2.0.0", runtime: "expected-runtime" });
    });

    test("repairs a genuinely stale actual npm tree to the locked version and runtime", () => {
        const directory = createActualNpmFixture(true, true);

        const result = runActualDependencyCheck(directory);

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain("invalid: expected-dependency@1.0.0");
        expect(installedDependency(directory)).toEqual({ version: "2.0.0", runtime: "expected-runtime" });
    });

    test("installs a missing actual npm tree from the lockfile with runnable output", () => {
        const directory = createActualNpmFixture(false);

        const result = runActualDependencyCheck(directory);

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain("Running npm ci for dependencies");
        expect(installedDependency(directory)).toEqual({ version: "2.0.0", runtime: "expected-runtime" });
    });
});
