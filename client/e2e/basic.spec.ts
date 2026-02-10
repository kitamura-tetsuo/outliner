import "./utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "./utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TST-0005
 *  Title   : Test Environment Initialization and Preparation
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

/**
 * @file basic.spec.ts
 * @description Basic functionality tests for the Outliner app
 * Tests basic app functions such as homepage display and authentication UI verification.
 * @playwright
 * @title Basic Tests
 */

/**
 * @testcase Homepage is displayed correctly
 * @description Verify that the app homepage is displayed correctly
 * @check Title "Outliner" is displayed when accessing the homepage
 * @check Authentication component is displayed on the screen
 */
test("Homepage is displayed correctly", async ({ page }) => {
    await page.goto("/");

    // Verify title is displayed
    await expect(page.locator("h1")).toContainText("Outliner");

    // Verify authentication component is displayed
    await expect(page.locator(".auth-section")).toBeVisible();
});

/**
 * @testcase Authentication UI is displayed correctly
 * @description Verify that the authentication UI component is displayed correctly
 * @check Google login button is displayed on the screen
 * @check Verify button existence using multiple selector methods
 */
test("Authentication UI is displayed correctly", async ({ page }) => {
    await page.goto("/");

    // Find button element using different methods (using more precise selectors)
    await expect(page.locator(".google-btn")).toBeVisible();

    // Or identify using CSS selector
    const loginButton = page.locator('button:has-text("Google")');
    await expect(loginButton).toBeVisible();
});

/**
 * @testcase Google login button is displayed after logout
 * @description Verify that Google login button reappears after logging out from a logged-in state
 * @check Google login button is displayed after clicking the logout button
 */
test("Google login button is displayed after logout", async ({ page }) => {
    await page.goto("/");
    const logoutButton = page.locator("button.logout-btn");
    if (await logoutButton.isVisible()) {
        await logoutButton.click();
    }
    await expect(page.locator(".google-btn")).toBeVisible();
});
