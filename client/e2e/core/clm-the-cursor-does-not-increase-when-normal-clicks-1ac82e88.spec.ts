import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0100
 *  Title   : Basic cursor management
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

import { TestHelpers } from "../utils/testHelpers";

test.describe("Cursor management tests", () => {
    test.setTimeout(180000); // 3 minutes
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Normal click does not increase cursor count", async ({ page }) => {
        // Prefer page title
        const item = page.locator(".outliner-item.page-title");

        // If page title not found, use first displayed item
        if (await item.count() === 0) {
            // Find items that can be identified by text content
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }

        // Wait for edit mode
        await page.waitForSelector("textarea.global-textarea:focus");

        // Wait for cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Verify initial cursor count
        const initialCursorCount = await page.evaluate(() => {
            return document.querySelectorAll(".editor-overlay .cursor").length;
        });
        console.log(`Initial cursor count: ${initialCursorCount}`);

        // Add a new item
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second item");
        await page.keyboard.press("Escape"); // Exit edit mode

        // Verify cursor count after Enter
        const cursorCountAfterEnter = await page.evaluate(() => {
            return document.querySelectorAll(".editor-overlay .cursor").length;
        });
        console.log(`Cursor count after Enter: ${cursorCountAfterEnter}`);

        // Click the first item
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click({ force: true });

        // Verify cursor count after first item click
        const cursorCountAfterFirstClick = await page.evaluate(() => {
            return document.querySelectorAll(".editor-overlay .cursor").length;
        });
        console.log(`Cursor count after first item click: ${cursorCountAfterFirstClick}`);

        // Verify cursor count did not increase
        expect(cursorCountAfterFirstClick).toBeLessThanOrEqual(initialCursorCount);

        // Click the second item
        const secondItem = page.locator(".outliner-item").nth(1);
        await secondItem.locator(".item-content").click({ force: true });

        // Verify cursor count after second item click
        const cursorCountAfterSecondClick = await page.evaluate(() => {
            return document.querySelectorAll(".editor-overlay .cursor").length;
        });
        console.log(`Cursor count after second item click: ${cursorCountAfterSecondClick}`);

        // Verify cursor count did not increase
        expect(cursorCountAfterSecondClick).toBeLessThanOrEqual(initialCursorCount);

        // Click the first item again
        await firstItem.locator(".item-content").click({ force: true });

        // Verify cursor count after third click
        const cursorCountAfterThirdClick = await page.evaluate(() => {
            return document.querySelectorAll(".editor-overlay .cursor").length;
        });
        console.log(`Cursor count after third click: ${cursorCountAfterThirdClick}`);

        // Verify cursor count did not increase
        expect(cursorCountAfterThirdClick).toBeLessThanOrEqual(initialCursorCount);
    });
});
