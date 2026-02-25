import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0001
 *  Title   : Enter edit mode by clicking
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-0001: Enter edit mode by clicking", () => {
    test.setTimeout(180000); // 3 minutes
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // Verify current URL
        const url = page.url();
        console.log("Current URL:", url);

        // Verify page elements
        const elements = await page.evaluate(() => {
            return {
                outlinerItems: document.querySelectorAll(".outliner-item").length,
                pageTitle: document.querySelector(".outliner-item.page-title") ? true : false,
                firstItem: document.querySelector(".outliner-item") ? true : false,
            };
        });
        console.log("Page elements:", elements);
    });

    test("Non-Alt click enters edit mode", async ({ page }) => {
        // Prefer page title (first displayed item)
        const item = page.locator(".outliner-item.page-title");

        // If page title not found, use first displayed item
        if (await item.count() === 0) {
            // Find items that can be identified by text content
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
            console.log("Clicked first visible item");
        } else {
            await item.locator(".item-content").click({ force: true });
            console.log("Clicked page title item");
        }

        // Take screenshot after click
        await page.screenshot({ path: "client/test-results/CLM-0001-after-click.png" });

        // Verify global textarea is focused
        const isFocused = await page.evaluate(() => {
            const active = document.activeElement;
            return active?.classList.contains("global-textarea");
        });
        console.log("Global textarea focused:", isFocused);
        expect(isFocused).toBe(true);

        // Wait for cursor to be visible
        const cursorVisible = await TestHelpers.waitForCursorVisible(page, 30000);
        console.log("Cursor visible:", cursorVisible);
        expect(cursorVisible).toBe(true);

        // Get and verify cursor data
        const cursorData = await CursorValidator.getCursorData(page);
        console.log("Cursor data:", cursorData);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.activeItemId).not.toBeNull();
    });
});
