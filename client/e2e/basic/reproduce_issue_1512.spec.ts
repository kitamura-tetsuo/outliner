import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Issue #1512: Shift + Right Arrow selection duplication", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Extend timeout for slow CI environments
        test.setTimeout(240000);

        // Seed with at least one line to avoid clicking the page title
        const seedLines = ["Item to select"];
        await TestHelpers.prepareTestEnvironment(page, testInfo, seedLines);

        // Select the first real item (index 1, as index 0 is page title)
        const items = page.locator(".outliner-item[data-item-id]");
        await expect(items).toHaveCount(2, { timeout: 30000 });
        const item = items.nth(1);
        await item.locator(".item-content").click({ force: true });

        // Wait until the cursor is visible and global textarea is focused
        await TestHelpers.ensureCursorReady(page);

        // Enter text (append to seeded line)
        await page.keyboard.press("End");
        await page.keyboard.type(" Hello World");

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
