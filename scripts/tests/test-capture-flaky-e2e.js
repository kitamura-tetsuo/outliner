import assert from "assert";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const SCRIPT_PATH = "scripts/capture-flaky-e2e.js";
const DUMMY_TEST_PATH = "e2e/debug/dummy-flaky-test.spec.ts";
const LOG_DIR = "e2e-logs";

/**
 * Executes a command and returns the output.
 * @param {string} command - The command to execute.
 * @returns {string} - The stdout of the command.
 */
function runCommand(command) {
    console.log(`Executing: ${command}`);
    const output = execSync(command, { encoding: "utf-8" });
    console.log(output);
    return output;
}

/**
 * Cleans up the log directory.
 */
function cleanup() {
    if (fs.existsSync(LOG_DIR)) {
        fs.rmSync(LOG_DIR, { recursive: true, force: true });
    }
}

/**
 * Runs the test for a flaky test.
 */
function testFlaky() {
    console.log("--- Testing flaky mode ---");
    cleanup();
    try {
        runCommand(`node ${SCRIPT_PATH} ${DUMMY_TEST_PATH}`);
    } catch (error) {
        // Expected to fail, but let's check artifacts
    }
    assert(fs.existsSync(path.join(LOG_DIR, "success")), "Success logs should exist for flaky test");
    assert(fs.existsSync(path.join(LOG_DIR, "failure")), "Failure logs should exist for flaky test");
    console.log("--- Flaky test PASSED ---");
}

/**
 * Runs the test for a consistently passing test.
 */
function testPassing() {
    console.log("--- Testing passing mode ---");
    cleanup();
    runCommand(`FLAKY_TEST_MODE=pass node ${SCRIPT_PATH} ${DUMMY_TEST_PATH}`);
    assert(fs.existsSync(path.join(LOG_DIR, "success")), "Success logs should exist for passing test");
    assert(
        !fs.existsSync(path.join(LOG_DIR, "failure")),
        "Failure logs should not exist for passing test",
    );
    console.log("--- Passing test PASSED ---");
}

/**
 * Runs the test for a consistently failing test.
 */
function testFailing() {
    console.log("--- Testing failing mode ---");
    cleanup();
    try {
        runCommand(`FLAKY_TEST_MODE=fail node ${SCRIPT_PATH} ${DUMMY_TEST_PATH}`);
        assert.fail("The script should have exited with a non-zero status code.");
    } catch (error) {
        assert(error.status !== 0, "Script should exit with a non-zero status code on failure.");
        console.log(`Caught expected error with status code: ${error.status}`);
    }
    assert(
        !fs.existsSync(path.join(LOG_DIR, "success")),
        "Success logs should not exist for failing test",
    );
    assert(fs.existsSync(path.join(LOG_DIR, "failure")), "Failure logs should exist for failing test");
    console.log("--- Failing test PASSED ---");
}

/**
 * Main function to run all tests.
 */
function main() {
    try {
        testFlaky();
        testPassing();
        testFailing();
        console.log("\nAll tests passed!");
    } catch (error) {
        console.error("\n❌ Test FAILED");
        console.error(error);
        process.exit(1);
    } finally {
        cleanup();
    }
}

main();
