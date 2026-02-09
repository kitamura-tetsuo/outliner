/**
 * Playwright E2E test coverage collection helper
 *
 * Collects V8 coverage using monocart-coverage-reports and
 * converts it to Istanbul format.
 *
 * Note: Coverage is always collected.
 */

import type { Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Checks if coverage collection is enabled
 * @deprecated Coverage is always collected, so this function is unnecessary
 */
export function isCoverageEnabled(): boolean {
    return true;
}

/**
 * Starts coverage collection on the page
 * @deprecated Coverage is automatically collected in registerCoverageHooks.ts
 */
export async function startCoverage(page: Page): Promise<void> {
    try {
        await page.coverage.startJSCoverage({
            resetOnNavigation: false,
            reportAnonymousScripts: true,
        });
    } catch (error) {
        console.warn("Failed to start coverage collection:", error);
    }
}

/**
 * Stops coverage collection on the page and saves the results
 * @deprecated Coverage is automatically collected in registerCoverageHooks.ts
 */
export async function stopCoverage(page: Page, testName: string): Promise<void> {
    try {
        const coverage = await page.coverage.stopJSCoverage();

        // Save coverage data
        const coverageDir = path.join(process.cwd(), "..", "coverage", "e2e", "raw");
        fs.mkdirSync(coverageDir, { recursive: true });

        // Generate filename from test name (remove special characters)
        const sanitizedTestName = testName.replace(/[^a-zA-Z0-9-_]/g, "_");
        const timestamp = Date.now();
        const coverageFile = path.join(coverageDir, `coverage-${sanitizedTestName}-${timestamp}.json`);

        fs.writeFileSync(coverageFile, JSON.stringify(coverage, null, 2));
    } catch (error) {
        console.warn("Failed to stop coverage collection:", error);
    }
}

/**
 * Note:
 * E2E test coverage is automatically collected by registerCoverageHooks.ts.
 * Use functions in this file only when you want to manually control coverage.
 *
 * Usually, it is sufficient to run tests with the COVERAGE=true environment variable set.
 */
