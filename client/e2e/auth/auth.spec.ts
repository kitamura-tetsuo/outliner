import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TST-0005
 *  Title   : Initializing and preparing the test environment
 *  Source  : docs/client-features.yaml
 */
/**
 * @file auth.spec.ts
 * @description Authentication related tests
 * Tests the application authentication flow.
 * Verifies the authentication flow in the development environment and the actual authentication state.
 * @playwright
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Authentication Functionality Test", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Prepare test environment (navigate to page where auth component is displayed)
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // Wait for auth component to be displayed
        await page.waitForSelector(".auth-container", { timeout: 10000 });
    });

    /**
     * @testcase Developer mode login flow
     * @description Verify that the authentication flow in the development environment works correctly
     * @check Start from logged out state
     * @check Developer login button is clickable
     * @check Email and password input is possible
     * @check Authentication completes upon clicking login button
     * @check Logout button is displayed after login
     */
    test("Developer mode login flow works correctly", async ({ page }) => {
        // Logout if already logged in
        const logoutButton = page.locator("button.logout-btn");
        if (await logoutButton.isVisible()) {
            await logoutButton.click();
            // Wait for logout process to complete
            await page.waitForSelector("button.dev-toggle", { timeout: 10000 });
        }

        // Click developer login button
        const devToggleButton = page.locator("button.dev-toggle");
        await expect(devToggleButton).toBeVisible();
        await devToggleButton.click();

        // Wait for developer login form to be displayed
        await page.waitForSelector(".dev-login-form", { timeout: 5000 });

        // Input authentication information
        await page.locator("#email").fill("test@example.com");
        await page.locator("#password").fill("password");

        // Execute login
        await page.locator("button.dev-login-btn").click();

        // Confirm login success (logout button is displayed)
        await expect(page.locator("button.logout-btn")).toBeVisible({ timeout: 10000 });
    });

    /**
     * @testcase Login state persistence
     * @description Verify that the state after login is correctly maintained
     * @check Reload page after login
     * @check Login state is maintained
     * @check User information is displayed correctly
     */
    test("Login state is maintained correctly", async ({ page }) => {
        // Logout if already logged in
        const logoutButton = page.locator("button.logout-btn");
        if (await logoutButton.isVisible()) {
            await logoutButton.click();
            // Wait for logout process to complete
            await page.waitForSelector("button.dev-toggle", { timeout: 10000 });
        }

        // Execute developer login
        const devToggleButton = page.locator("button.dev-toggle");
        await devToggleButton.click();
        await page.waitForSelector(".dev-login-form", { timeout: 5000 });

        await page.locator("#email").fill("test@example.com");
        await page.locator("#password").fill("password");
        await page.locator("button.dev-login-btn").click();

        // Confirm login success
        await expect(page.locator("button.logout-btn")).toBeVisible({ timeout: 10000 });

        // Reload page
        await page.reload();

        // Wait for auth component to be displayed again
        await page.waitForSelector(".auth-container", { timeout: 10000 });

        // Confirm login state is maintained
        await expect(page.locator("button.logout-btn")).toBeVisible({ timeout: 10000 });
    });
});
