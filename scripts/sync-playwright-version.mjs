#!/usr/bin/env node
/**
 * Automatically keeps the E2E container's Playwright base image version aligned
 * with the resolved @playwright/test version in client/package-lock.json.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const DOCKERFILE = path.join(".github", "container", "Dockerfile");
const LOCKFILE = path.join("client", "package-lock.json");

const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf-8");

let lock;
try {
    lock = JSON.parse(read(LOCKFILE));
} catch (err) {
    console.error(`Failed to read or parse lockfile at ${LOCKFILE}`);
    process.exit(1);
}

const pkg = "@playwright/test";
const entry = lock.packages[`node_modules/${pkg}`];
if (!entry?.version || !/^\d+\.\d+\.\d+/.test(entry.version)) {
    console.error(`Lockfile ${LOCKFILE} has no valid resolved version for ${pkg}.`);
    process.exit(1);
}

const testVersion = entry.version;

let dockerfileContent;
try {
    dockerfileContent = read(DOCKERFILE);
} catch (err) {
    console.error(`Failed to read Dockerfile at ${DOCKERFILE}`);
    process.exit(1);
}

const regex = /^(FROM mcr\.microsoft\.com\/playwright:v)(\d+\.\d+\.\d+)(-\w+)$/gm;
const matches = [...dockerfileContent.matchAll(regex)];
if (matches.length !== 1) {
    console.error(
        `Dockerfile at ${DOCKERFILE} does not contain a uniquely identifiable expected Playwright base-image declaration.`,
    );
    process.exit(1);
}

const match = matches[0];
const currentImageVersion = match[2];

if (currentImageVersion !== testVersion) {
    console.log(
        `Mismatch detected: Dockerfile is at ${currentImageVersion}, lockfile requires ${testVersion}. Syncing...`,
    );
    const newContent = dockerfileContent.replace(match[0], `${match[1]}${testVersion}${match[3]}`);
    fs.writeFileSync(path.join(repoRoot, DOCKERFILE), newContent, "utf-8");
    console.log(`Synced ${DOCKERFILE} to v${testVersion}.`);
} else {
    console.log(`Playwright versions are already aligned at v${testVersion}.`);
}
