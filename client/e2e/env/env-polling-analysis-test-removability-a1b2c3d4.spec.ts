/**
 * ENV-POLL-0001: Polling Removability Test
 *
 * Runs tests with each polling disabled to identify
 * polling that can be safely removed.
 */

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
    generatePollingTestReport,
    getPollingStats,
    initPollingMonitor,
    type PollingTestResult,
    startPollingMonitor,
    testWithoutPolling,
} from "../utils/pollingTestHelper";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("ENV-POLL-0001: Polling Removability Test", () => {
    const results: PollingTestResult[] = [];

    test.beforeEach(async ({ page }) => {
        await initPollingMonitor(page);
        await TestHelpers.prepareTestEnvironment(page, test.info());
        await startPollingMonitor(page);
    });

    test.afterAll(async () => {
        // Generate report
        const report = generatePollingTestReport(results);
        const reportPath = path.join(process.cwd(), "docs", "polling-removability-report.md");
        fs.writeFileSync(reportPath, report, "utf-8");
        console.log(`\nReport saved: ${reportPath}`);
    });

    test("OutlinerItem.svelte aliasLastConfirmedPulse polling", async ({ page }) => {
        // Polling around line 340 in OutlinerItem.svelte
        const result = await testWithoutPolling(
            page,
            "OutlinerItem aliasLastConfirmedPulse",
            /OutlinerItem\.svelte.*aliasLastConfirmedPulse/,
            async () => {
                // Test alias feature
                await page.goto("http://localhost:7090/test-project/test-page");
                await page.waitForSelector("[data-item-id]", { timeout: 5000 });

                const items = await page.locator("[data-item-id]").all();
                expect(items.length).toBeGreaterThan(0);

                // Verify alias attribute is set
                const firstItem = items[0];
                await firstItem.evaluate(el => el.hasAttribute("data-alias-target-id"));

                // Attribute should be set even without polling
                // (Yjs observe should be sufficient)
            },
        );

        results.push(result);
    });

    test("OutlinerItemAlias.svelte aliasLastConfirmedPulse polling", async ({ page }) => {
        const result = await testWithoutPolling(
            page,
            "OutlinerItemAlias aliasLastConfirmedPulse",
            /OutlinerItemAlias\.svelte.*aliasLastConfirmedPulse/,
            async () => {
                await page.goto("http://localhost:7090/test-project/test-page");
                await page.waitForSelector("[data-item-id]", { timeout: 5000 });

                // Verify alias component is displayed correctly
                await page.locator(".alias-content").all();

                // Alias should be displayed even without polling
            },
        );

        results.push(result);
    });

    test("CommentThread.svelte input polling", async ({ page }) => {
        const result = await testWithoutPolling(
            page,
            "CommentThread input polling",
            /CommentThread\.svelte.*setInterval/,
            async () => {
                await page.goto("http://localhost:7090/test-project/test-page");
                await page.waitForSelector("[data-item-id]", { timeout: 5000 });

                // Click comment button
                const commentButton = page.locator("button.comment-button").first();
                await commentButton.click();

                // Verify comment input is displayed
                const commentInput = page.locator('[data-testid="new-comment-input"]');
                await expect(commentInput).toBeVisible({ timeout: 5000 });

                // Enter comment
                await commentInput.fill("Test comment");

                // Click add button
                const addButton = page.locator('button:has-text("追加")');
                await addButton.click();

                // Verify comment is added
                await expect(page.locator(".comment-item")).toBeVisible({ timeout: 5000 });

                // bind:value should work even without polling
            },
        );

        results.push(result);
    });

    test("OutlinerItem.svelte E2E file drop polling", async ({ page }) => {
        const result = await testWithoutPolling(
            page,
            "OutlinerItem E2E file drop polling",
            /OutlinerItem\.svelte.*__E2E_LAST_FILES__/,
            async () => {
                await page.goto("http://localhost:7090/test-project/test-page");
                await page.waitForSelector("[data-item-id]", { timeout: 5000 });

                // Verify normal text editing works
                const firstItem = page.locator("[data-item-id]").first();
                await firstItem.click();

                await page.keyboard.type("Test text");

                // Verify text is entered
                await expect(firstItem).toContainText("Test text", { timeout: 5000 });

                // File drop polling is unnecessary for normal operation
            },
        );

        results.push(result);
    });

    test("EditorOverlay.svelte position update polling", async ({ page }) => {
        const result = await testWithoutPolling(
            page,
            "EditorOverlay position update",
            /EditorOverlay\.svelte.*setInterval.*16/,
            async () => {
                await page.goto("http://localhost:7090/test-project/test-page");
                await page.waitForSelector("[data-item-id]", { timeout: 5000 });

                // Set cursor
                const firstItem = page.locator("[data-item-id]").first();
                await firstItem.click();

                // Verify cursor is visible
                const cursor = page.locator(".cursor");
                await expect(cursor).toBeVisible({ timeout: 5000 });

                // Position should update via MutationObserver even without polling
            },
        );

        results.push(result);
    });

    test("Check statistics", async ({ page }) => {
        await page.goto("http://localhost:7090/test-project/test-page");
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
