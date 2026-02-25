import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Issue #1512: Shift + Right Arrow selection duplication", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // Select the first item
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click({ force: true });

        // Wait until the cursor is visible
        await TestHelpers.waitForCursorVisible(page);

        // Wait until the global textarea is focused
        await page.waitForSelector("textarea.global-textarea:focus", { timeout: 10000 });

        // Enter text
        await page.keyboard.type("Hello World");

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
