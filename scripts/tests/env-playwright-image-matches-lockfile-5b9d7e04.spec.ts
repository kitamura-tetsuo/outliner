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

const imageVersion = () => {
    const from = read(".github", "container", "Dockerfile").match(
        /^FROM mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-\w+$/m,
    );
    expect(from, "Dockerfile must pin an explicit mcr.microsoft.com/playwright version").not.toBeNull();
    return from![1];
};

const lockedVersion = (pkg: string) => {
    const lock = JSON.parse(read("client", "package-lock.json"));
    const entry = lock.packages[`node_modules/${pkg}`];
    expect(entry, `${pkg} must be present in client/package-lock.json`).toBeDefined();
    return entry.version as string;
};

test("the container image version matches the locked @playwright/test version", () => {
    // The image ships the browser bundle for exactly its own release. If npm
    // resolves a different Playwright, every E2E shard dies at
    // browserType.launch with "Executable doesn't exist".
    expect(imageVersion()).toBe(lockedVersion("@playwright/test"));
});

test("the driver package is locked to the same version as the test runner", () => {
    // @playwright/test and playwright must agree, otherwise matching the image
    // to one of them still leaves the other looking for absent browsers.
    expect(lockedVersion("playwright")).toBe(lockedVersion("@playwright/test"));
});
