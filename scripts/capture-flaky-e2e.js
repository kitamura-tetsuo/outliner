#!/usr/bin/env node

import { execSync } from "child_process";

const testPath = process.argv[2];
if (!testPath) {
    console.error("Please provide a path to the test file.");
    process.exit(1);
}

console.log(`Target test file: ${testPath}`);

const command = `npx playwright test ${testPath}`;

try {
    console.log(`Executing: ${command}`);
    execSync(command, { stdio: "inherit", cwd: "client" });
    console.log("Test execution completed successfully.");
} catch (error) {
    console.error("Test execution failed.");
    process.exit(1);
}
