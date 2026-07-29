import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0100
 *  Title   : Cursor management basic functionality
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

import { TestHelpers } from "../utils/testHelpers";

const countCursors = (page: import("@playwright/test").Page) =>
    page.evaluate(() => document.querySelectorAll(".editor-overlay .cursor").length);

/**
 * The overlay mirrors the cursor store into the DOM through a ~16ms debounce, so a
 * single read right after an interaction can observe the previous render. Poll until
 * the caret count settles instead of sampling once.
 */
const expectCursorCountAtMost = async (page: import("@playwright/test").Page, max: number, label: string) => {
    await expect.poll(() => countCursors(page), { message: label }).toBeLessThanOrEqual(max);
};

test.describe("Cursor management tests", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);
    });

    test("Cursor count does not increase on normal click", async ({ page }) => {
        // Preferentially use page title
        const item = page.locator(".outliner-item.page-title");

        // If page title is not found, use the first visible item
        if (await item.count() === 0) {
            // Find an item identifiable by text content
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }

        // Wait to enter edit mode
        await page.waitForSelector("textarea.global-textarea:focus");

        // Wait for the cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Check initial cursor count. The caret must already be rendered here: a baseline
        // of 0 would make every later comparison fail even though the cursor count never
        // actually grew.
        await expect.poll(() => countCursors(page), { message: "initial caret rendered" })
            .toBeGreaterThanOrEqual(1);
        const initialCursorCount = await countCursors(page);
        console.log(`Initial cursor count: ${initialCursorCount}`);

        // Add a new item
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second item");
        await page.keyboard.press("Escape"); // Exit edit mode

        // Check cursor count after Enter
        console.log(`Cursor count after Enter: ${await countCursors(page)}`);

        // Click the first item
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click({ force: true });

        // Verify that cursor count has not increased
        await expectCursorCountAtMost(page, initialCursorCount, "after clicking the first item");

        // Click the second item
        const secondItem = page.locator(".outliner-item").nth(1);
        await secondItem.locator(".item-content").click({ force: true });

        // Verify that cursor count has not increased
        await expectCursorCountAtMost(page, initialCursorCount, "after clicking the second item");

        // Click the first item again
        await firstItem.locator(".item-content").click({ force: true });

        // Verify that cursor count has not increased
        await expectCursorCountAtMost(page, initialCursorCount, "after clicking again");
    });
});
