import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Registers E2E test coverage collection hooks into the caller's scope (each spec file).
 *
 * Note:
 * - Due to Node.js module caching, simply importing as a side effect might only register the hook in the first file.
 *   Therefore, this function must be explicitly called from each spec.
 * - This ensures `afterEach` is registered for each file even when running multiple test files in the same worker.
 *
 * Environment Variables:
 * - Set `PRECISE_COVERAGE=true` to run in Precise Coverage mode.
 * - Default is Best-effort Coverage mode.
 */
export function registerCoverageHooks(): void {
    if (process.env.E2E_DISABLE_COVERAGE === "1") {
        console.log("[Coverage] Disabled by E2E_DISABLE_COVERAGE environment variable");
        return;
    }
    const usePreciseCoverage = process.env.PRECISE_COVERAGE === "true";

    if (usePreciseCoverage) {
        console.log("[Coverage] Using Precise Coverage mode (PRECISE_COVERAGE=true)");
        registerPreciseCoverageHooks();
    } else {
        console.log("[Coverage] Using Best-effort Coverage mode (default)");
        registerBestEffortCoverageHooks();
    }
}

/**
 * Best-effort Coverage mode (default)
 * - Low performance impact.
 * - Execution counts of event handlers and callbacks may not be recorded correctly.
 */
function registerBestEffortCoverageHooks(): void {
    // Start coverage collection before each test
    test.beforeEach(async ({ page }, testInfo) => {
        try {
            console.log(`[Coverage] beforeEach start for: ${testInfo.title}`);
            await page.coverage.startJSCoverage({
                resetOnNavigation: false,
                reportAnonymousScripts: true,
            });
        } catch (error: any) {
            if (!error?.message || !String(error.message).includes("Coverage is already started")) {
                console.warn("[Coverage] Failed to start coverage collection:", error);
            } else {
                console.log("[Coverage] already started");
            }
        }
    });

    // Save coverage after each test
    test.afterEach(async ({ page }, testInfo) => {
        try {
            console.log(`[Coverage] afterEach for: ${testInfo.title}, closed=${page.isClosed()}`);
            if (page.isClosed()) return;

            const coverage = await page.coverage.stopJSCoverage();
            console.log(`[Coverage] collected entries: ${Array.isArray(coverage) ? coverage.length : "n/a"}`);

            // Save coverage data
            const coverageDir = path.join(process.cwd(), "..", "coverage", "e2e", "raw");
            fs.mkdirSync(coverageDir, { recursive: true });

            // Generate filename from test name (remove special characters)
            const testFile = path.basename(testInfo.file, ".spec.ts");
            const testTitle = testInfo.title.replace(/[^a-zA-Z0-9-_]/g, "_");
            const timestamp = Date.now();
            const coverageFile = path.join(
                coverageDir,
                `coverage-${testFile}-${testTitle}-${timestamp}.json`,
            );

            fs.writeFileSync(coverageFile, JSON.stringify(coverage, null, 2));
            console.log(`[Coverage] wrote: ${coverageFile}`);
        } catch (error) {
            console.error(`[Coverage] Failed to stop coverage collection (${testInfo.title}):`, error);
        }
    });
}

/**
 * Precise Coverage mode
 * - Accurately captures execution counts of event handlers and callbacks.
 * - High performance impact.
 * - Execution speed is slower because optimizations are disabled.
 *
 * Usage:
 * PRECISE_COVERAGE=true npm run test:e2e
 */
function registerPreciseCoverageHooks(): void {
    let cdpSession: any = null;

    // Start Precise Coverage before each test
    test.beforeEach(async ({ page }, testInfo) => {
        try {
            console.log(`[PreciseCoverage] beforeEach start for: ${testInfo.title}`);

            // Create CDP session
            cdpSession = await page.context().newCDPSession(page);

            // Enable Profiler
            await cdpSession.send("Profiler.enable");

            // Start Precise Coverage
            // callCount: true - Capture execution counts
            // detailed: true - Capture block-level coverage
            await cdpSession.send("Profiler.startPreciseCoverage", {
                callCount: true,
                detailed: true,
            });

            console.log(`[PreciseCoverage] Started with callCount and detailed mode`);
        } catch (error: any) {
            console.error("[PreciseCoverage] Failed to start coverage collection:", error);
        }
    });

    // Save coverage after each test
    test.afterEach(async ({ page }, testInfo) => {
        try {
            console.log(`[PreciseCoverage] afterEach for: ${testInfo.title}, closed=${page.isClosed()}`);
            if (page.isClosed() || !cdpSession) return;

            // Retrieve Precise Coverage
            const { result } = await cdpSession.send("Profiler.takePreciseCoverage");
            console.log(`[PreciseCoverage] collected entries: ${Array.isArray(result) ? result.length : "n/a"}`);

            // Stop Precise Coverage
            await cdpSession.send("Profiler.stopPreciseCoverage");
            await cdpSession.send("Profiler.disable");

            // Detach CDP session
            await cdpSession.detach();
            cdpSession = null;

            // Save coverage data
            const coverageDir = path.join(process.cwd(), "..", "coverage", "e2e", "raw-precise");
            fs.mkdirSync(coverageDir, { recursive: true });

            // Generate filename from test name (remove special characters)
            const testFile = path.basename(testInfo.file, ".spec.ts");
            const testTitle = testInfo.title.replace(/[^a-zA-Z0-9-_]/g, "_");
            const timestamp = Date.now();
            const coverageFile = path.join(
                coverageDir,
                `coverage-precise-${testFile}-${testTitle}-${timestamp}.json`,
            );

            fs.writeFileSync(coverageFile, JSON.stringify(result, null, 2));
            console.log(`[PreciseCoverage] wrote: ${coverageFile}`);
        } catch (error) {
            console.error(`[PreciseCoverage] Failed to stop coverage collection (${testInfo.title}):`, error);
        }
    });
}
