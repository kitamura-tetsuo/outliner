import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Issue #1512: Shift + Right Arrow selection duplication", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["Hello World"]);

        // Select the first content item (index 1, as index 0 is the page title)
        const itemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(itemId).not.toBeNull();
        const item = page.locator(`.outliner-item[data-item-id="${itemId}"]`);
        await item.locator(".item-content").click({ force: true });

        // Wait until the cursor is fully ready (visible and focused)
        await TestHelpers.ensureCursorReady(page);

        // Move cursor to the beginning
        await page.keyboard.press("Home");
    });

    test("Shift + Right Arrow should not duplicate selection highlights", async ({ page }) => {
        // Press Shift + Right Arrow multiple times
        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(100);
        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(100);
        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(100);

        // Count the number of selection DOM elements (.selection)
        const selectionCount = await page.locator(".editor-overlay .selection").count();

        // If duplicated, count should be greater than 1 (usually 1 for selection within a single item)
        expect(selectionCount).toBe(1);

        // Count the number of cursor DOM elements (.cursor)
        // Without filtering by cursor ID, test dummies might be included, but
        // check for active class or simply count .cursor
        // EditorOverlay renders all cursors in store.cursors
        const cursorCount = await page.locator(".editor-overlay .cursor").count();
        expect(cursorCount).toBe(1);
    });
});
