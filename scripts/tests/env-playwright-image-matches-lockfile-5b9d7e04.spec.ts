import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

/** @feature ENV-5b9d7e04
 *  Title   : Test container Playwright image matches the locked Playwright version
 *  Source  : docs/dev-features/env-playwright-image-matches-lockfile-5b9d7e04.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

const read = (...segments: string[]) => fs.readFileSync(path.join(repoRoot, ...segments), "utf-8");

test("the versions currently in the repository agree", () => {
    // Exercises the same script CI runs, so the check and the test cannot drift.
    const output = execFileSync("node", ["scripts/check-playwright-version.mjs"], {
        cwd: repoRoot,
        encoding: "utf-8",
    });

    expect(output).toMatch(/Playwright versions agree/);
});

test("the browser install pins the CLI to the version the tests run with", () => {
    // `playwright install` prunes browsers outside the CLI's own registry, so an
    // unpinned CLI deletes the revision @playwright/test needs the moment a
    // newer Playwright ships on npm.
    const shell = read("scripts", "common-functions.sh");

    expect(shell).toMatch(/playwright_pinned_version\(\)/);
    expect(shell).toMatch(/cli="playwright@\$\{pinned\}"/);
    expect(shell).toMatch(/npx --yes "\$cli" install chromium/);
    expect(shell).toMatch(/npx --yes "\$cli" install-deps chromium/);
});

test("a dedicated CI job runs the check on every pull request", () => {
    const workflow = read(".github", "workflows", "ci-playwright-version.yml");
    expect(workflow).toMatch(/workflow_call:/);
    expect(workflow).toMatch(/node scripts\/check-playwright-version\.mjs/);

    // The entry workflow must call it, otherwise the check never runs on a PR.
    const ci = read(".github", "workflows", "ci.yml");
    expect(ci).toMatch(/uses: \.\/\.github\/workflows\/ci-playwright-version\.yml/);
    expect(ci).toMatch(/pull_request:/);
});
