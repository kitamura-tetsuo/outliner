/**
 * ENV-POLL-0001: Polling Removability Test
 *
 * Runs tests with each polling disabled to identify
 * polling that can be safely removed.
 */

import { test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
    generatePollingTestReport,
    getPollingStats,
    initPollingMonitor,
    type PollingTestResult,
    startPollingMonitor,
} from "../utils/pollingTestHelper";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("ENV-POLL-0001: Polling Removability Test", () => {
    const results: PollingTestResult[] = [];
    let projectInfo: { projectName: string; pageName: string; };

    test.beforeEach(async ({ page }) => {
        await initPollingMonitor(page);
        projectInfo = await TestHelpers.seedProjectAndNavigate(page, test.info());
        await startPollingMonitor(page);
    });

    test.afterAll(async () => {
        // Generate report
        const report = generatePollingTestReport(results);
        const reportPath = path.join(process.cwd(), "docs", "polling-removability-report.md");
        fs.writeFileSync(reportPath, report, "utf-8");
        console.log(`\nReport saved: ${reportPath}`);
    });

    test("Check statistics", async ({ page }) => {
        await page.goto(
            `http://localhost:7090/${encodeURIComponent(projectInfo.projectName)}/${
                encodeURIComponent(projectInfo.pageName)
            }`,
        );
        await page.waitForSelector("[data-item-id]", { timeout: 5000 });

        // Wait a bit for polling to run
        await page.waitForTimeout(3000);

        // Get polling stats
        const stats = await getPollingStats(page);

        console.log("\n=== Polling Statistics ===");
        console.log(`Total Calls: ${stats.totalCalls}`);
        console.log(`Active: ${stats.activeCalls}`);
        console.log(`Disabled: ${stats.disabledCalls}`);

        // Show frequent pollings
        const sortedCalls = stats.calls.sort((a: any, b: any) => b.executionCount - a.executionCount);

        console.log("\nTop 10 Frequent Pollings:");
        for (const call of sortedCalls.slice(0, 10)) {
            console.log(`  - ${call.type} (delay=${call.delay}ms): Executed ${call.executionCount} times`);

            // Identify caller from stack trace
            const stackLines = call.stack.split("\n");
            const relevantLine = stackLines.find((line: string) => line.includes(".svelte") || line.includes(".ts"));
            if (relevantLine) {
                console.log(`    ${relevantLine.trim()}`);
            }
        }

        // Warn short interval polling
        const shortIntervalPolling = stats.calls.filter((call: any) =>
            call.type === "setInterval" && call.delay && call.delay < 200
        );

        if (shortIntervalPolling.length > 0) {
            console.log(`\n⚠ Warning: ${shortIntervalPolling.length} short interval (<200ms) pollings detected`);
            for (const call of shortIntervalPolling) {
                console.log(`  - delay=${call.delay}ms, Execution Count=${call.executionCount}`);
            }
        }
    });
});
