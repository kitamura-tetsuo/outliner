#!/usr/bin/env node

import { execSync } from "child_process";
import fse from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const testPath = process.argv[2];
if (!testPath) {
    console.error("Usage: ./scripts/capture-flaky-e2e.js <path_to_test_file>");
    process.exit(1);
}

const maxAttempts = 10;
let attempts = 0;
let successCount = 0;
let failureCount = 0;

const tempSuccessDir = "/tmp/e2e-flaky-capture/success-run";
const tempFailureDir = "/tmp/e2e-flaky-capture/failure-run";
const finalSuccessDir = path.join(projectRoot, "e2e-logs/success");
const finalFailureDir = path.join(projectRoot, "e2e-logs/failure");

const clientDir = path.join(projectRoot, "client");
const playwrightReportDir = path.join(clientDir, "playwright-report");
const testResultsDir = path.join(clientDir, "test-results");

async function run() {
    console.log(`Starting flaky test capture for: ${testPath}`);
    console.log(`Max attempts: ${maxAttempts}`);
    console.log("Stop condition: at least 1 success and 1 failure, or max attempts reached.");

    // Clear previous temporary artifacts
    await fse.emptyDir(tempSuccessDir);
    await fse.emptyDir(tempFailureDir);

    while (attempts < maxAttempts && !(successCount > 0 && failureCount > 0)) {
        attempts++;
        console.log(`\n--- Attempt ${attempts}/${maxAttempts} ---`);

        try {
            // Clean up artifacts from previous run
            await fse.remove(playwrightReportDir);
            await fse.remove(testResultsDir);

            const relativeTestPath = testPath.startsWith("client/")
                ? testPath.substring("client/".length)
                : testPath;

            const command =
                `npx dotenvx run --overload --env-file=.env.test -- npx playwright test --reporter=list --retries=0 ${relativeTestPath}`;
            console.log(`Executing command in ${clientDir}:\n${command}`);
            execSync(command, {
                stdio: "inherit",
                cwd: clientDir,
                env: {
                    ...process.env,
                    NODE_ENV: "test",
                    TEST_ENV: "localhost",
                    DISABLE_MAX_FAILURES: "true",
                },
            });

            console.log("✅ Test PASSED");
            successCount++;

            if (successCount === 1) {
                console.log("Capturing success artifacts...");
                await fse.ensureDir(tempSuccessDir);
                if (await fse.pathExists(playwrightReportDir)) {
                    await fse.move(playwrightReportDir, path.join(tempSuccessDir, "playwright-report"));
                }
                if (await fse.pathExists(testResultsDir)) {
                    await fse.move(testResultsDir, path.join(tempSuccessDir, "test-results"));
                }
            }
        } catch (error) {
            console.error("❌ Test FAILED");
            failureCount++;

            if (failureCount === 1) {
                console.log("Capturing failure artifacts...");
                await fse.ensureDir(tempFailureDir);
                if (await fse.pathExists(playwrightReportDir)) {
                    await fse.move(playwrightReportDir, path.join(tempFailureDir, "playwright-report"));
                }
                if (await fse.pathExists(testResultsDir)) {
                    await fse.move(testResultsDir, path.join(tempFailureDir, "test-results"));
                }
            }
        }
    }

    console.log("\n--- Summary ---");
    console.log(`Total attempts: ${attempts}`);
    console.log(`Successes: ${successCount}`);
    console.log(`Failures: ${failureCount}`);

    // Consolidate artifacts
    if (successCount > 0) {
        console.log(`Saving success artifacts to: ${finalSuccessDir}`);
        await fse.emptyDir(finalSuccessDir);
        await fse.copy(tempSuccessDir, finalSuccessDir);
    }
    if (failureCount > 0) {
        console.log(`Saving failure artifacts to: ${finalFailureDir}`);
        await fse.emptyDir(finalFailureDir);
        await fse.copy(tempFailureDir, finalFailureDir);
    }

    // Clean up temp directories
    await fse.remove("/tmp/e2e-flaky-capture");

    if (successCount > 0 && failureCount > 0) {
        console.log("\nFlaky test detected and logs captured.");
    } else {
        console.log("\nCould not capture both a success and a failure run.");
    }
}

run().catch((err) => {
    console.error("An unexpected error occurred:", err);
    process.exit(1);
});
