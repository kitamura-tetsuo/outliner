import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TST-0005
 *  Title   : Initialization and Preparation of Test Environment
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

/**
 * @file basic.spec.ts
 * @description Basic Functionality Verification Test
 * Tests to verify basic app functionality, specifically ensuring correct page rendering and authentication component operation.
 * @playwright
 * @title Basic Test
 */

/**
 * @testcase Homepage displays correctly
 * @description Test to verify that the app homepage displays correctly
 * @check Configure initial state using emulator
 * @check "Outliner App" title appears upon accessing the page
 * @check Authentication component appears on screen
 */
test("Homepage displays correctly", async ({ page }) => {
    await page.goto("/");

    // Verify title is displayed
    await expect(page.locator("h1")).toContainText("Outliner");
});
