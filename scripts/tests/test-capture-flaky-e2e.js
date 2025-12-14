import assert from "assert";
import { exec, execSync } from "child_process";
import fse from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const scriptToTest = path.join(projectRoot, "scripts/capture-flaky-e2e.js");
const dummyTest = "client/e2e/debug/dummy-flaky-test.spec.ts";

const successDir = path.join(projectRoot, "e2e-logs/success");
const failureDir = path.join(projectRoot, "e2e-logs/failure");
const stateFile = "/tmp/flaky-test-state.txt";

async function runTest(mode, expectSuccess, expectFailure) {
    console.log(`\n--- Running test in mode: ${mode} ---`);

    // Cleanup
    await fse.remove(successDir);
    await fse.remove(failureDir);
    if (fse.existsSync(stateFile)) {
        fse.unlinkSync(stateFile);
    }

    try {
        const command = `FLAKY_TEST_MODE=${mode} ${scriptToTest} ${dummyTest}`;
        console.log(`Executing: ${command}`);
        execSync(command, { stdio: "inherit", cwd: projectRoot });
    } catch (error) {
        // The script might exit with an error, which is expected for failing tests
    }

    const successExists = await fse.pathExists(successDir);
    const failureExists = await fse.pathExists(failureDir);

    assert.strictEqual(
        successExists,
        expectSuccess,
        `Expected success directory to ${expectSuccess ? "exist" : "not exist"} in ${mode} mode`,
    );
    assert.strictEqual(
        failureExists,
        expectFailure,
        `Expected failure directory to ${expectFailure ? "exist" : "not exist"} in ${mode} mode`,
    );

    console.log(`--- Test PASSED in mode: ${mode} ---`);
}

async function main() {
    try {
        await runTest("flaky", true, true);
        await runTest("pass", true, false);
        await runTest("fail", false, true);
        console.log("\nAll tests passed!");
    } catch (error) {
        console.error("\nTest failed:", error.message);
        process.exit(1);
    }
}

main();
