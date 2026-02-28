import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0001
 *  Title   : Enter Edit Mode by Clicking
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-0001: Enter Edit Mode by Clicking", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // Check the current URL
        const url = page.url();
        console.log("Current URL:", url);

        // Check elements on the page
        const elements = await page.evaluate(() => {
            return {
                outlinerItems: document.querySelectorAll(".outliner-item").length,
                pageTitle: document.querySelector(".outliner-item.page-title") ? true : false,
                firstItem: document.querySelector(".outliner-item") ? true : false,
            };
        });
        console.log("Page elements:", elements);
    });

    test("Enter edit mode with non-Alt click", async ({ page }) => {
        // Use page title preferentially (the first item displayed)
        const item = page.locator(".outliner-item.page-title");

        // If the page title is not found, use the first visible item
        if (await item.count() === 0) {
            // Look for an item that can be identified by its text content
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
            console.log("Clicked first visible item");
        } else {
            await item.locator(".item-content").click({ force: true });
            console.log("Clicked page title item");
        }

        // Take a screenshot (after click)
        await page.screenshot({ path: "client/test-results/CLM-0001-after-click.png" });

        // Check if the hidden textarea is focused
        const isFocused = await page.evaluate(() => {
            const active = document.activeElement;
            return active?.classList.contains("global-textarea");
        });
        console.log("Global textarea focused:", isFocused);
        expect(isFocused).toBe(true);

        // Wait for the cursor to be visible
        const cursorVisible = await TestHelpers.waitForCursorVisible(page, 30000);
        console.log("Cursor visible:", cursorVisible);
        expect(cursorVisible).toBe(true);

        // Get cursor data and verify
        const cursorData = await CursorValidator.getCursorData(page);
        console.log("Cursor data:", cursorData);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.activeItemId).not.toBeNull();
    });
});
