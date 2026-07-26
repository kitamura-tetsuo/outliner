import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TST-0005
 *  Title   : Test Environment Initialization and Preparation
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

/**
 * @file basic.spec.ts
 * @description Basic functionality tests for the Outliner app
 * Tests that the app boots and renders its home page and auth UI for the
 * signed-in E2E test user.
 * @playwright
 * @title Basic Tests
 */

/**
 * @testcase Homepage is displayed correctly
 * @description Verify that the app homepage renders for the authenticated test user
 * @check The home page container is displayed
 * @check Title "Outliner" is displayed
 */
test("Homepage is displayed correctly", async ({ page }) => {
    await page.goto("/");

    // The E2E environment signs in automatically, so "/" renders AuthenticatedHome.
    await expect(page.getByTestId("home-page")).toBeVisible();
    await expect(page.locator("h1")).toContainText("Outliner");
});

/**
 * @testcase Home page offers the project selector and creation entry point
 * @description Verify the authenticated home page exposes its two ways into a project
 * @check The project selector is displayed
 * @check The "Create New Outliner" link is displayed
 */
test("Home page offers the project selector and creation entry point", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("select.project-select")).toBeVisible();
    await expect(page.getByRole("link", { name: /Create New Outliner/i })).toBeVisible();
});

/**
 * @testcase Authentication UI reflects the signed-in user
 * @description AuthComponent is rendered on /projects/new; verify it shows the
 * signed-in state rather than the Google sign-in button
 * @check The logout button is displayed for the signed-in test user
 * @check The Google sign-in button is not displayed
 */
test("Authentication UI reflects the signed-in user", async ({ page }) => {
    // "/" renders AuthenticatedHome or LandingContent, neither of which mounts
    // AuthComponent; /projects/new is where the auth UI actually lives.
    await page.goto("/projects/new");

    await expect(page.locator(".auth-section")).toBeVisible();
    await expect(page.locator("button.logout-btn")).toBeVisible();
    await expect(page.locator(".google-btn")).toHaveCount(0);
});
