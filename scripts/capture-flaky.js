import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const testPath = process.argv[2];
if (!testPath) {
    console.error("Please provide a path to the test file.");
    process.exit(1);
}

const numRuns = 10;
const baseOutputDir = path.join("test-results", path.basename(testPath));

for (let i = 1; i <= numRuns; i++) {
    const outputDir = path.join(baseOutputDir, `run-${i}`);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const command = [
        "npx playwright test",
        testPath,
        "--reporter=html",
        `--output=${outputDir}`,
        "--trace=on",
    ].join(" ");

    console.log(`\n--- Running test (run ${i} of ${numRuns}) ---`);
    console.log(command);

    try {
        execSync(command, { stdio: "inherit", cwd: "client" });
        console.log(`--- Test run ${i} passed ---`);
    } catch (error) {
        console.error(`--- Test run ${i} failed ---`);
    }
}

console.log(`\nFinished ${numRuns} test runs.`);
console.log(`Test results and traces are saved in: ${baseOutputDir}`);
