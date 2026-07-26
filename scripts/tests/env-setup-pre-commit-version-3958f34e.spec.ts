import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

/** @feature ENV-3958f34e
 *  Title   : Setup installs a pre-commit new enough for the hook config
 *  Source  : docs/dev-features/env-setup-pre-commit-version-3958f34e.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const setupScript = path.join(repoRoot, "scripts", "setup.sh");
const commonConfig = path.join(repoRoot, "scripts", "common-config.sh");
const commonFunctions = path.join(repoRoot, "scripts", "common-functions.sh");

// The floor exists because .pre-commit-config.yaml uses the stage names
// renamed in pre-commit 3.2; older releases abort with InvalidConfigError.
const MINIMUM = "3.2.0";

/**
 * Run ensure_pre_commit_version against a fake `pre-commit` reporting
 * `version`, with a stubbed `python3` so the repair path cannot reach the
 * network. Returns the combined output.
 */
function runVersionCheck(version: string): string {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "pre-commit-stub-"));
    fs.writeFileSync(path.join(binDir, "pre-commit"), `#!/bin/bash\necho "pre-commit ${version}"\n`, { mode: 0o755 });
    // The upgrade attempt must not install anything during the test.
    fs.writeFileSync(path.join(binDir, "python3"), "#!/bin/bash\nexit 1\n", { mode: 0o755 });

    try {
        return execSync(
            `PATH="${binDir}:$PATH" bash -c 'ROOT_DIR="${repoRoot}"; `
                + `source "${commonConfig}" >/dev/null 2>&1; source "${commonFunctions}"; ensure_pre_commit_version'`,
            { cwd: repoRoot, encoding: "utf8", stdio: "pipe" },
        );
    } finally {
        fs.rmSync(binDir, { recursive: true, force: true });
    }
}

test("the required pre-commit version is configured centrally", () => {
    const content = fs.readFileSync(commonConfig, "utf8");
    expect(content.includes(`export PRE_COMMIT_MIN_VERSION="${MINIMUM}"`)).toBe(true);
});

test("setup installs pre-commit with that version floor", () => {
    const content = fs.readFileSync(setupScript, "utf8");
    expect(content.includes('python3 -m pip install --no-cache-dir "pre-commit>=${PRE_COMMIT_MIN_VERSION}"')).toBe(
        true,
    );
    // Also verified outside the install block, so a cached setup (sentinel
    // present) still corrects a stale pre-commit.
    expect(content.includes("ensure_pre_commit_version")).toBe(true);
});

test("a pre-commit older than the floor is reported as unusable", () => {
    const output = runVersionCheck("3.0.4");
    expect(output).toContain("older than the required 3.2.0");
    expect(output).toContain("cannot parse .pre-commit-config.yaml");
});

test("a pre-commit at or above the floor is accepted", () => {
    expect(runVersionCheck(MINIMUM)).toContain(`pre-commit ${MINIMUM} satisfies the required ${MINIMUM}`);
    expect(runVersionCheck("4.6.1")).toContain("pre-commit 4.6.1 satisfies the required 3.2.0");
});

test("the hook config still uses the stage names that require the floor", () => {
    const content = fs.readFileSync(path.join(repoRoot, ".pre-commit-config.yaml"), "utf8");
    expect(content.includes("stages: [pre-commit]")).toBe(true);
});
