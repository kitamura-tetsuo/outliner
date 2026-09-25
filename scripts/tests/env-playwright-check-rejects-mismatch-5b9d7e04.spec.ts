import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { afterEach, expect, test } from "vitest";
import { DOCKERFILE, dockerfile, makeTmp, repoRoot, writeFiles } from "./helpers/playwright-sync-fixture";

/** @feature ENV-5b9d7e04
 *  Title   : Test container Playwright image matches the locked Playwright version
 *  Source  : docs/dev-features/env-playwright-image-matches-lockfile-5b9d7e04.yaml
 */

const dirs: string[] = [];
afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

interface Versions {
    image: string;
    test: string;
    runner: string;
    core?: string;
    nestedCore?: string;
}

/** Runs the production check against a disposable copy with the given versions. */
function check(v: Versions) {
    const dir = makeTmp();
    dirs.push(dir);
    const packages: Record<string, { version: string; }> = {
        "node_modules/@playwright/test": { version: v.test },
        "node_modules/playwright": { version: v.runner },
    };
    if (v.core) packages["node_modules/playwright-core"] = { version: v.core };
    if (v.nestedCore) packages["node_modules/playwright/node_modules/playwright-core"] = { version: v.nestedCore };
    const files = {
        "scripts/check-playwright-version.mjs": fs.readFileSync(
            path.join(repoRoot, "scripts/check-playwright-version.mjs"),
            "utf-8",
        ),
        "scripts/common-functions.sh": fs.readFileSync(path.join(repoRoot, "scripts/common-functions.sh"), "utf-8"),
        "client/package-lock.json": JSON.stringify({ packages }),
        [DOCKERFILE]: dockerfile(v.image),
    };
    writeFiles(dir, files);
    const result = spawnSync("node", ["scripts/check-playwright-version.mjs"], { cwd: dir, encoding: "utf-8" });
    for (const [file, content] of Object.entries(files)) {
        expect(fs.readFileSync(path.join(dir, file), "utf-8"), `${file} was modified`).toBe(content);
    }
    return { status: result.status, output: result.stdout + result.stderr };
}

const ALIGNED: Versions = { image: "1.63.0", test: "1.63.0", runner: "1.63.0", core: "1.63.0", nestedCore: "1.63.0" };

test.each([
    ["all packages present", ALIGNED],
    ["no playwright-core entries", { image: "1.63.0", test: "1.63.0", runner: "1.63.0" }],
])("aligned fixtures pass without mutation: %s (AS-006)", (_, versions) => {
    const result = check(versions);
    expect(result.status, result.output).toBe(0);
    expect(result.output).toMatch(/Playwright versions agree: image v1\.63\.0/);
});

test.each([
    ["the Dockerfile image", { image: "1.62.1" }, /pinned to playwright v1\.62\.1/],
    ["@playwright/test", { test: "1.64.0" }, /resolves @playwright\/test to 1\.64\.0/],
    ["the playwright runner", { runner: "1.62.1" }, /resolves playwright to 1\.62\.1/],
    ["the hoisted playwright-core", { core: "1.62.0" }, /hoists playwright-core 1\.62\.0/],
    ["the runner's nested playwright-core", { nestedCore: "1.62.0" }, /behind playwright to 1\.62\.0/],
])("a mismatch in %s fails (AS-006)", (_, change, diagnostic) => {
    const result = check({ ...ALIGNED, ...change });
    expect(result.status).toBe(1);
    expect(result.output).toMatch(diagnostic);
});
