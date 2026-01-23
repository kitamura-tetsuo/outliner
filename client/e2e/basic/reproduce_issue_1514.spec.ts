import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Item Component Type Selector Test", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        const seedLines = ["Test Item"];
        const { projectName, pageName } = await TestHelpers.createAndSeedProject(page, testInfo, seedLines);
        await TestHelpers.navigateToProjectPage(page, projectName, pageName, seedLines);
    });

    test("Component type selector should remain open/focused when clicked", async ({ page }) => {
        // Page title is usually the first one or marked specially, but here we seeded "Test Item" so likely the second one (index 1) or we look for text.
        // The implementation says `{#if !isPageTitle}` for component selector.
        // So we look for the component selector.

        const selector = page.locator(".component-selector select").first();
        await expect(selector).toBeVisible();

        // Click the selector
        await selector.click();

        // Wait a bit to allow any potential blur/focus events to happen
        await page.waitForTimeout(500);

        // Check if the selector is focused
        const isFocused = await selector.evaluate((el) => document.activeElement === el);

        // If the bug exists, focus would have moved to the global textarea due to startEditing()
        expect(isFocused).toBe(true);
    });
});
