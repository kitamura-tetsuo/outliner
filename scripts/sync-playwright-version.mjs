#!/usr/bin/env node
/**
 * Aligns the working tree's E2E container Playwright base image with the
 * resolved @playwright/test version in client/package-lock.json.
 *
 * This is the local convenience command. CI publishes the same correction to a
 * pull request's source branch with scripts/publish-playwright-sync.mjs.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { authoritativeVersion, DOCKERFILE, LOCKFILE, planDockerfileSync } from "./playwright-version-sync-lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf-8");

try {
    const version = authoritativeVersion(read(LOCKFILE));
    const plan = planDockerfileSync(read(DOCKERFILE), version);
    if (plan.changed) {
        fs.writeFileSync(path.join(repoRoot, DOCKERFILE), plan.content, "utf-8");
        console.log(`Synced ${DOCKERFILE} from v${plan.currentVersion} to v${version}.`);
    } else {
        console.log(`Playwright versions are already aligned at v${version}.`);
    }
} catch (err) {
    console.error(err.message);
    process.exit(1);
}
