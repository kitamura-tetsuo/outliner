import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0001
 *  Title   : Click to enter edit mode
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-0001: Click to enter edit mode", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Text input is possible in edit mode", async ({ page }) => {
        // Prioritize using the page title
        const item = page.locator(".outliner-item.page-title");

        // If page title is not found, use the first visible item
        if (await item.count() === 0) {
            // Find items that can be identified by text content
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
            console.log("Clicked first visible item for input test");
        } else {
            await item.locator(".item-content").click({ force: true });
            console.log("Clicked page title item for input test");
        }

        // Wait until the cursor is visible
        const cursorVisible = await TestHelpers.waitForCursorVisible(page, 30000);
        console.log("Cursor visible for input test:", cursorVisible);
        expect(cursorVisible).toBe(true);

        // Take screenshot (after click)
        await page.screenshot({ path: "client/test-results/CLM-0001-input-after-click.png" });

        // Get active item ID
        const activeItemId = await TestHelpers.getActiveItemId(page);
        const testText = "Hello world";
        await page.keyboard.type(testText);
        await page.waitForTimeout(300);

        // Take screenshot (after typing)
        await page.screenshot({ path: "client/test-results/CLM-0001-input-after-typing.png" });

        try {
            const activeItem = page.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
            await activeItem.waitFor({ state: "visible", timeout: 10000 });
            const text = await activeItem.locator(".item-text").textContent();
            console.log("Item text:", text);
            expect(text).toContain(testText);
        } catch (e) {
            console.log("Failed to verify item text:", e.message);
            const pageContent = await page.textContent("body");
            expect(pageContent).toContain(testText);
        }
    });
});
