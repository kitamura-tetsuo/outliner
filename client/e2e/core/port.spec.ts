import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TST-0005
 *  Title   : Initialization and Preparation of Test Environment
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

/**
 * @file port.spec.ts
 * @description Test Environment Port Configuration Verification Test
 * Test to confirm that the application is running on the correct port (7080 or 7090).
 * This test verifies that the appropriate port settings are in place in CI and development environments.
 * @playwright
 * @title Test Environment Port Verification
 */

test.describe("Test Environment Port Verification", () => {
    /**
     * @testcase Application running on port 7080 or 7090
     * @description Test to confirm that the application is running on the correct port (7080 or 7090) in the test environment
     * @check Confirm that baseURL is "http://localhost:7080" or "http://localhost:7090"
     * @check Confirm that the URL after page access contains "localhost:7080" or "localhost:7090"
     * @check Confirm that the application title "Outliner App" is displayed
     * @check Take a screenshot for visual confirmation
     */
    test("Application running on port 7080 or 7090", async ({ page, baseURL }) => {
        // Verify the test environment URL
        expect(baseURL).toMatch(/(7080|7090)/);

        // Access the page
        await page.goto("/");

        // Check the port directly from the URL
        const url = page.url();
        expect(url).toMatch(/(7080|7090)/);

        // Log the port number
        console.log(`Test execution URL: ${url}`);

        // Confirm that the page is displayed correctly
        await expect(page.locator("h1")).toContainText("Outliner");

        // Take a screenshot
        await page.screenshot({ path: "test-results/test-port-confirmation.png" });
    });
});
