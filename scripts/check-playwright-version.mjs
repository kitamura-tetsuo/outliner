#!/usr/bin/env node
/**
 * Verifies that the E2E test container tracks the Playwright version the client
 * actually installs.
 *
 * The mcr.microsoft.com/playwright image ships the browser bundle for exactly
 * its own release. When the pinned image and the resolved @playwright/test
 * version drift apart, every E2E shard fails at browserType.launch with
 * "Executable doesn't exist at /ms-playwright/...", long before any test code
 * runs. This check turns that into a fast, obvious CI failure instead.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const DOCKERFILE = path.join(".github", "container", "Dockerfile");
const LOCKFILE = path.join("client", "package-lock.json");

const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf-8");

/** The Playwright release pinned by the test container's base image. */
function imageVersion() {
    const match = read(DOCKERFILE).match(/^FROM mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-\w+$/m);
    if (!match) {
        throw new Error(`${DOCKERFILE} does not pin an explicit mcr.microsoft.com/playwright version.`);
    }
    return match[1];
}

/** The version npm resolved for a package, as recorded in the lockfile. */
function lockedVersion(lock, pkg) {
    const entry = lock.packages[`node_modules/${pkg}`];
    if (!entry?.version) {
        throw new Error(`${LOCKFILE} has no resolved version for ${pkg}.`);
    }
    return entry.version;
}

const lock = JSON.parse(read(LOCKFILE));
const image = imageVersion();
const test = lockedVersion(lock, "@playwright/test");
const driver = lockedVersion(lock, "playwright");

const problems = [];
if (image !== test) {
    problems.push(
        `${DOCKERFILE} is pinned to playwright v${image}, but ${LOCKFILE} resolves @playwright/test to ${test}.\n`
            + `  Fix: set the base image to mcr.microsoft.com/playwright:v${test}-jammy, or pin @playwright/test back to ${image}.`,
    );
}
if (driver !== test) {
    problems.push(
        `${LOCKFILE} resolves playwright to ${driver} but @playwright/test to ${test}; they must match.`,
    );
}

// playwright-core owns the browser registry. A direct dependency on it gets
// hoisted to the top level, where it can shadow the copy the test runner
// expects -- which is how a lone Dependabot bump of playwright-core drifts the
// required browser revision away from what the image provides. @playwright/mcp
// and mcp-playwright pin their own nested copies and version independently, so
// only the top level and the runner's own copy are checked here.
const hoistedCore = lock.packages["node_modules/playwright-core"]?.version;
if (hoistedCore !== undefined && hoistedCore !== test) {
    problems.push(
        `${LOCKFILE} hoists playwright-core ${hoistedCore} to the top level while @playwright/test is ${test}.\n`
            + `  playwright-core is not imported anywhere; it is pulled in as a direct dependency of client/package.json.\n`
            + `  Fix: drop it (\`npm uninstall playwright-core\` in client/) or align it with @playwright/test.`,
    );
}
const runnerCore = lock.packages["node_modules/playwright/node_modules/playwright-core"]?.version
    ?? hoistedCore;
if (runnerCore !== undefined && runnerCore !== test) {
    problems.push(
        `${LOCKFILE} resolves the playwright-core behind playwright to ${runnerCore} but @playwright/test to ${test}; they must match.`,
    );
}

// `playwright install` prunes every browser outside the CLI's own registry, so
// an unpinned CLI deletes the revision @playwright/test needs as soon as a
// newer Playwright ships. The browser install must name a version.
const BROWSER_INSTALL = path.join("scripts", "common-functions.sh");
const unpinned = read(BROWSER_INSTALL)
    .split("\n")
    .filter((line) => /npx .*\bplaywright\b(?!@)[^@\n]*\binstall(-deps)?\b/.test(line) && !line.trim().startsWith("#"));
if (unpinned.length > 0) {
    problems.push(
        `${BROWSER_INSTALL} installs browsers with an unpinned Playwright CLI:\n`
            + unpinned.map((line) => `      ${line.trim()}`).join("\n")
            + `\n  Fix: invoke the CLI as playwright@<version> using the version resolved in ${LOCKFILE}.`,
    );
}

if (problems.length > 0) {
    console.error("Playwright version mismatch:\n");
    for (const problem of problems) {
        console.error(`- ${problem}`);
    }
    console.error(
        '\nA mismatch makes every E2E shard fail at browserType.launch with "Executable doesn\'t exist".',
    );
    process.exit(1);
}

console.log(`Playwright versions agree: image v${image}, @playwright/test ${test}, playwright ${driver}.`);
