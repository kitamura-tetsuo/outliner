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
