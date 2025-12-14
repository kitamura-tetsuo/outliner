#!/usr/bin/env node

import { execSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const ARTIFACTS_DIR = path.resolve(REPO_ROOT, "artifacts");
const SUCCESS_DIR = path.resolve(ARTIFACTS_DIR, "success");
const FAIL_DIR = path.resolve(ARTIFACTS_DIR, "fail");
const PLAYWRIGHT_OUTPUT_DIR = path.resolve(REPO_ROOT, "test-results-flaky");

function runTest(testPath) {
    const command = [
        "npx",
        "playwright",
        "test",
        testPath,
        "--retries=0",
        "--trace=on",
        `--output=${PLAYWRIGHT_OUTPUT_DIR}`,
    ].join(" ");

    try {
        console.log(`\nExecuting: ${command}`);
        execSync(command, {
            cwd: path.resolve(REPO_ROOT, "client"),
            stdio: "inherit",
            env: { ...process.env, DISABLE_MAX_FAILURES: "true" },
        });
        return true; // Success
    } catch (error) {
        console.error(`Test run failed for: ${testPath}`);
        return false; // Failure
    }
}

async function main() {
    const testPath = process.argv[2];
    if (!testPath) {
        console.error("Usage: capture-flaky-e2e.js <path_to_test_file>");
        process.exit(1);
    }

    let hasFailed = false;
    let hasSucceeded = false;

    fs.emptyDirSync(SUCCESS_DIR);
    fs.emptyDirSync(FAIL_DIR);
    fs.emptyDirSync(PLAYWRIGHT_OUTPUT_DIR);

    console.log(`Starting test runner for flaky test: ${testPath}`);

    for (let i = 0; i < 20 && (!hasFailed || !hasSucceeded); i++) {
        const success = runTest(testPath);
        if (success && !hasSucceeded && hasFailed) {
            console.log("Test succeeded after a failure, capturing artifacts...");
            fs.copySync(PLAYWRIGHT_OUTPUT_DIR, SUCCESS_DIR);
            hasSucceeded = true;
        } else if (!success && !hasFailed) {
            console.log("Test failed, capturing artifacts...");
            fs.copySync(PLAYWRIGHT_OUTPUT_DIR, FAIL_DIR);
            hasFailed = true;
        }
        fs.emptyDirSync(PLAYWRIGHT_OUTPUT_DIR);
    }

    if (hasFailed && hasSucceeded) {
        console.log("\nSuccessfully captured artifacts for a failure and a success.");
        console.log(`Failure artifacts: ${FAIL_DIR}`);
        console.log(`Success artifacts: ${SUCCESS_DIR}`);
    } else {
        console.log("\nCould not capture the required test outcomes.");
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
