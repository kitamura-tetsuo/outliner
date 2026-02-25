import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Issue #1512: Shift + Right Arrow selection duplication", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(180000); // 3 minutes
        // Seed with a visible line to ensure we have a content item that is rendered
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["item1"]);

        // Select the first content item (not the page title)
        const item = page.locator(".outliner-item:not(.page-title)").first();
        await item.waitFor({ state: "visible", timeout: 30000 });
        await item.locator(".item-content").click({ force: true });

        // Ensure cursor is ready and textarea is focused
        await TestHelpers.ensureCursorReady(page);

        // Clear existing text and enter new text for the test
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Backspace");
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
