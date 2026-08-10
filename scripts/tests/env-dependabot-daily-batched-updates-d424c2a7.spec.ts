import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

/** @feature ENV-d424c2a7
 *  Title   : Dependabot spreads updates daily and batches them across directories
 *  Source  : docs/dev-features/env-dependabot-daily-batched-updates-d424c2a7.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const dependabot = fs.readFileSync(path.join(repoRoot, ".github", "dependabot.yml"), "utf8");

const entries = dependabot
    .split(/^(?=  - package-ecosystem:)/m)
    .filter(block => block.startsWith("  - package-ecosystem:"));

const ecosystemOf = (entry: string) => /package-ecosystem: '([^']+)'/.exec(entry)?.[1];

test("npm updates are declared once, not once per directory", () => {
    // Seven separate npm entries meant `ws@8.21.2` landed as three pull
    // requests -- /client, /server and /scripts -- each running the full CI
    // matrix for the same version bump.
    const npm = entries.filter(entry => ecosystemOf(entry) === "npm");

    expect(npm).toHaveLength(1);
    expect(npm[0]).toMatch(/^ {4}directories:$/m);
    expect(npm[0]).not.toMatch(/^ {4}directory:/m);
});

test("every entry runs daily", () => {
    // Weekly does not reduce the number of updates, it only accumulates them:
    // on 2026-08-10 a week's worth arrived as nineteen pull requests inside
    // five minutes, which is more than CI drains before the next batch.
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
        expect(entry, `${ecosystemOf(entry)} entry should be daily`).toMatch(/^ {6}interval: 'daily'$/m);
    }
});

test("each entry caps how many pull requests can be open at once", () => {
    for (const entry of entries) {
        const limit = /open-pull-requests-limit: (\d+)/.exec(entry)?.[1];

        expect(limit, `${ecosystemOf(entry)} entry should cap open pull requests`).toBeDefined();
        expect(Number(limit)).toBeLessThanOrEqual(5);
    }
});

test("a catch-all group collects the minor and patch updates", () => {
    // Without it every unmatched dependency is its own pull request again.
    const npm = entries.find(entry => ecosystemOf(entry) === "npm")!;
    const group = npm.slice(npm.indexOf("      minor-and-patch:"));

    expect(npm).toContain("      minor-and-patch:");
    expect(group).toMatch(/^ {10}- 'minor'$/m);
    expect(group).toMatch(/^ {10}- 'patch'$/m);
});

test("the catch-all group is declared after the specific groups", () => {
    // Dependabot assigns a dependency to the first group it matches, so a
    // catch-all placed above the named groups would swallow Playwright and
    // Svelte and undo the reason those groups exist.
    const npm = entries.find(entry => ecosystemOf(entry) === "npm")!;
    const catchAll = npm.indexOf("      minor-and-patch:");

    for (const group of ["      playwright:", "      svelte-core:", "      typescript-and-lint:"]) {
        const index = npm.indexOf(group);

        expect(index, `missing group ${group.trim()}`).toBeGreaterThanOrEqual(0);
        expect(index, `${group.trim()} must precede the catch-all group`).toBeLessThan(catchAll);
    }
});

test("major updates stay ungrouped", () => {
    // A major bump is the one that breaks a build, and it has to be able to
    // fail without holding back the batch it would otherwise ride along with.
    const npm = entries.find(entry => ecosystemOf(entry) === "npm")!;
    const group = npm.slice(npm.indexOf("      minor-and-patch:"));

    expect(group).not.toContain("- 'major'");
});
