import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0100
 *  Title   : Cursor management basic functionality
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

import { TestHelpers } from "../utils/testHelpers";

test.describe("Cursor management tests", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
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

        // Check initial cursor count
        const initialCursorCount = await page.evaluate(() => {
            return document.querySelectorAll(".editor-overlay .cursor").length;
        });
        console.log(`Initial cursor count: ${initialCursorCount}`);

        // Add a new item
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second item");
        await page.keyboard.press("Escape"); // Exit edit mode

        // Check cursor count after Enter
        const cursorCountAfterEnter = await page.evaluate(() => {
            return document.querySelectorAll(".editor-overlay .cursor").length;
        });
        console.log(`Cursor count after Enter: ${cursorCountAfterEnter}`);

        // Click the first item
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click({ force: true });

        // Check cursor count after clicking the first item
        const cursorCountAfterFirstClick = await page.evaluate(() => {
            return document.querySelectorAll(".editor-overlay .cursor").length;
        });
        console.log(`Cursor count after clicking the first item: ${cursorCountAfterFirstClick}`);

        // Verify that cursor count has not increased
        expect(cursorCountAfterFirstClick).toBeLessThanOrEqual(initialCursorCount);

        // Click the second item
        const secondItem = page.locator(".outliner-item").nth(1);
        await secondItem.locator(".item-content").click({ force: true });

        // Check cursor count after clicking the second item
        const cursorCountAfterSecondClick = await page.evaluate(() => {
            return document.querySelectorAll(".editor-overlay .cursor").length;
        });
        console.log(`Cursor count after clicking the second item: ${cursorCountAfterSecondClick}`);

        // Verify that cursor count has not increased
        expect(cursorCountAfterSecondClick).toBeLessThanOrEqual(initialCursorCount);

        // Click the first item again
        await firstItem.locator(".item-content").click({ force: true });

        // Check cursor count after clicking again
        const cursorCountAfterThirdClick = await page.evaluate(() => {
            return document.querySelectorAll(".editor-overlay .cursor").length;
        });
        console.log(`Cursor count after clicking again: ${cursorCountAfterThirdClick}`);

        // Verify that cursor count has not increased
        expect(cursorCountAfterThirdClick).toBeLessThanOrEqual(initialCursorCount);
    });
});
