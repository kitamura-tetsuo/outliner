import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TST-0005
 *  Title   : Test environment initialization and preparation
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

/**
 * @file port.spec.ts
 * @description Test environment port configuration verification test
 * This is a test to verify that the application is running on the correct port (7080 or 7090).
 * This test verifies that proper port configuration is done in CI and development environments.
 * @playwright
 * @title Test environment port verification
 */

test.describe("Test environment port verification", () => {
    /**
     * @testcase Application runs on port 7080 or 7090
     * @description Test to verify that the application is running on the correct port (7080 or 7090) in the test environment
     * @check Verify that the baseURL is "http://localhost:7080" or "http://localhost:7090"
     * @check Verify that the URL after accessing the page contains "localhost:7080" or "localhost:7090"
     * @check Verify that the application title "Outliner App" is displayed
     * @check Take a screenshot for visual confirmation
     */
    test("Application runs on port 7080 or 7090", async ({ page, baseURL }) => {
        // Verify test environment URL
        expect(baseURL).toMatch(/(7080|7090)/);

        // Access the page
        await page.goto("/");

        // Verify port directly from URL
        const url = page.url();
        expect(url).toMatch(/(7080|7090)/);

        // Output port number to log
        console.log(`URL during test execution: ${url}`);

        // Verify that the page is displayed correctly
        await expect(page.locator("h1")).toContainText("Outliner");

        // Take a screenshot
        await page.screenshot({ path: "test-results/test-port-confirmation.png" });
    });
});
