#!/usr/bin/env tsx
/**
 * Polling Disable Test Tool
 *
 * Temporarily disables specific polling to run tests and
 * checks if it affects the test results.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface TestResult {
    pollingId: string;
    testPassed: boolean;
    testOutput: string;
    error?: string;
}

interface DisableConfig {
    file: string;
    line: number;
    originalCode: string;
    disabledCode: string;
}

/**
 * Generate code to disable polling
 */
function generateDisabledCode(originalCode: string, type: string): string {
    // Comment out to disable
    return `// [POLLING-TEST-DISABLED] ${originalCode}`;
}

/**
 * Temporarily replace a specific line in a file
 */
function disablePollingInFile(filePath: string, lineNumber: number, originalCode: string): DisableConfig {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // Create backup
    const backupPath = `${filePath}.polling-test-backup`;
    fs.writeFileSync(backupPath, content, "utf-8");

    // Disable specific line
    const disabledCode = generateDisabledCode(lines[lineNumber - 1], "setInterval");
    lines[lineNumber - 1] = disabledCode;

    // Update file
    fs.writeFileSync(filePath, lines.join("\n"), "utf-8");

    return {
        file: filePath,
        line: lineNumber,
        originalCode,
        disabledCode,
    };
}

/**
 * Restore file
 */
function restoreFile(filePath: string) {
    const backupPath = `${filePath}.polling-test-backup`;

    if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, filePath);
        fs.unlinkSync(backupPath);
    }
}

/**
 * Run tests
 */
function runTests(testFile?: string): { passed: boolean; output: string; } {
    try {
        const testCommand = testFile
            ? `cd client && npm run test:e2e -- ${testFile}`
            : `cd client && npm run test:e2e:basic`;

        const output = execSync(testCommand, {
            encoding: "utf-8",
            stdio: "pipe",
            timeout: 300000, // 5 minutes timeout
        });

        return {
            passed: true,
            output,
        };
    } catch (error: any) {
        return {
            passed: false,
            output: error.stdout || error.stderr || error.message,
        };
    }
}

/**
 * Disable specific polling and test
 */
async function testWithoutPolling(
    filePath: string,
    lineNumber: number,
    originalCode: string,
    pollingId: string,
    testFile?: string,
): Promise<TestResult> {
    console.log(`\nTest started: ${pollingId}`);
    console.log(`  File: ${filePath}:${lineNumber}`);
    console.log(`  Code: ${originalCode.trim()}`);

    let config: DisableConfig | null = null;

    try {
        // Disable polling
        console.log("  Disabling polling...");
        config = disablePollingInFile(filePath, lineNumber, originalCode);

        // Run tests
        console.log("  Running tests...");
        const result = runTests(testFile);

        console.log(`  Result: ${result.passed ? "✓ PASSED" : "✗ FAILED"}`);

        return {
            pollingId,
            testPassed: result.passed,
            testOutput: result.output,
        };
    } catch (error: any) {
        console.log(`  Error: ${error.message}`);

        return {
            pollingId,
            testPassed: false,
            testOutput: "",
            error: error.message,
        };
    } finally {
        // Restore file
        if (config) {
            console.log("  Restoring file...");
            restoreFile(config.file);
        }
    }
}

/**
 * Generate report
 */
function generateTestReport(results: TestResult[]): string {
    let md = "# Polling Disable Test Report\n\n";
    md += `Generated at: ${new Date().toISOString()}\n\n`;
    md += `## Overview\n\n`;
    md += `- Tests executed: ${results.length}\n`;
    md += `- Passed even if disabled: ${results.filter(r => r.testPassed).length}\n`;
    md += `- Failed if disabled: ${results.filter(r => !r.testPassed).length}\n\n`;

    // Polling that succeeded even if disabled (removal candidates)
    const removable = results.filter(r => r.testPassed);
    if (removable.length > 0) {
        md += `## Removable Polling\n\n`;
        md += `Tests passed even when these pollings were disabled. Removal can be considered.\n\n`;

        for (const result of removable) {
            md += `### ${result.pollingId}\n\n`;
            md += `- **Test Result**: ✓ PASSED\n`;
            md += `- **Recommendation**: This polling is likely safe to remove\n\n`;
        }
    }

    // Polling that failed if disabled (necessary)
    const necessary = results.filter(r => !r.testPassed);
    if (necessary.length > 0) {
        md += `## Necessary Polling\n\n`;
        md += `Tests failed when these pollings were disabled. They should not be removed.\n\n`;

        for (const result of necessary) {
            md += `### ${result.pollingId}\n\n`;
            md += `- **Test Result**: ✗ FAILED\n`;
            md += `- **Recommendation**: This polling is necessary\n`;
            if (result.error) {
                md += `- **Error**: ${result.error}\n`;
            }
            md += `\n`;
        }
    }

    return md;
}

/**
 * Main process
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log("Usage:");
        console.log("  npm run test:polling -- <polling-report.json>");
        console.log("");
        console.log("Please run analyze-polling.ts first to generate a polling report.");
        process.exit(1);
    }

    const reportPath = args[0];

    if (!fs.existsSync(reportPath)) {
        console.error(`Error: Report file not found: ${reportPath}`);
        process.exit(1);
    }

    console.log("Starting polling disable test...\n");

    // Load report (assuming JSON format)
    const reportContent = fs.readFileSync(reportPath, "utf-8");
    const report = JSON.parse(reportContent);

    const results: TestResult[] = [];

    // Test only suspicious polling
    const suspiciousPolling = report.categorized?.suspicious || [];

    console.log(`Target: ${suspiciousPolling.length} suspicious pollings\n`);

    for (const polling of suspiciousPolling) {
        const result = await testWithoutPolling(
            polling.file,
            polling.line,
            polling.code,
            polling.id,
        );

        results.push(result);

        // Wait a bit between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Generate report
    const markdown = generateTestReport(results);
    const outputPath = path.join(process.cwd(), "docs", "polling-test-report.md");
    fs.writeFileSync(outputPath, markdown, "utf-8");

    console.log(`\nTest report saved: ${outputPath}`);

    // Display summary
    console.log("\n=== Summary ===");
    console.log(`Tests executed: ${results.length}`);
    console.log(`Removable: ${results.filter(r => r.testPassed).length}`);
    console.log(`Necessary: ${results.filter(r => !r.testPassed).length}`);
}

main().catch(console.error);
