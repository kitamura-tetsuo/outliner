#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const e2eDir = path.resolve(__dirname, "../client/e2e");

const findCmd = 'find e2e -type f -name "*.spec.ts" | grep -v "disabled/"';
const onDiskFiles = execSync(findCmd, { cwd: path.resolve(__dirname, "../client"), encoding: "utf-8" })
    .trim()
    .split("\n")
    .filter(Boolean);

const listCmd = "npx playwright test --list";
const listedOutput = execSync(listCmd, { cwd: path.resolve(__dirname, "../client"), encoding: "utf-8" });

const listedFilesSet = new Set();
const lines = listedOutput.split("\n");
for (const line of lines) {
    const match = line.match(/(e2e\/.*?\.spec\.ts)/);
    if (match) {
        listedFilesSet.add(match[1]);
    }
}

const uncollected = [];
for (const file of onDiskFiles) {
    if (!listedFilesSet.has(file)) {
        uncollected.push(file);
    }
}

if (uncollected.length > 0) {
    console.error(
        `ERROR: The following spec files are not collected by any Playwright project:\n${uncollected.join("\n")}`,
    );
    process.exit(1);
}

console.log("All spec files are correctly collected by Playwright projects.");
