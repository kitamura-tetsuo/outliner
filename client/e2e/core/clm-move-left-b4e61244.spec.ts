import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0002
 *  Title   : Move Left
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-0002: Move Left", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // Use page title preferentially
        const item = page.locator(".outliner-item.page-title[data-item-id]");

        // If page title is not found, use the first visible item
        if (await item.count() === 0) {
            // Search for items that can be identified by text content
            const visibleItems = page.locator(".outliner-item[data-item-id]").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }

        // Wait until the cursor is visible
        await TestHelpers.waitForCursorVisible(page);

        // Wait for the hidden textarea to be focused
        await page.waitForSelector("textarea.global-textarea:focus");
        // Input text
        await page.keyboard.type("Test data update");
    });

    test("Cursor moves one character left with ArrowLeft key", async ({ page }) => {
        // Wait until the cursor is visible
        await TestHelpers.waitForCursorVisible(page);

        // Get and verify cursor info
        const initialCursorData = await CursorValidator.getCursorData(page);
        expect(initialCursorData.cursorCount).toBe(1);
        expect(initialCursorData.activeItemId).not.toBeNull();
        const initialOffset = initialCursorData.cursorInstances[0].offset;

        // Press ArrowLeft key
        await page.keyboard.press("ArrowLeft");
        // Wait for update
        await page.waitForTimeout(100);

        // Get and verify cursor info again
        const updatedCursorData = await CursorValidator.getCursorData(page);
        expect(updatedCursorData.cursorCount).toBe(1);
        expect(updatedCursorData.activeItemId).not.toBeNull();
        const updatedOffset = updatedCursorData.cursorInstances[0].offset;

        // Verify it moved left - offset should be decreased by 1
        expect(updatedOffset).toBe(initialOffset - 1);
    });

    test("When at the first character, moves to the last character of the previous item", async ({ page }) => {
        // This test is skipped temporarily until the cross-item cursor movement logic is fixed
        // Wait until the cursor is visible
        await TestHelpers.waitForCursorVisible(page);

        // Get the ID of the first item
        const itemId1 = await TestHelpers.getActiveItemId(page);
        expect(itemId1).not.toBeNull();

        // Create second item (Create new item with Enter)
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second item");

        // Verify it moved to the new item
        await TestHelpers.waitForCursorVisible(page);
        const itemId2 = await TestHelpers.getActiveItemId(page);
        expect(itemId2).not.toBeNull();
        expect(itemId2).not.toBe(itemId1);

        // Move cursor to the beginning of the line
        await page.keyboard.press("Home");
        await page.waitForTimeout(100);

        // Press ArrowLeft key to move to the previous item
        await page.keyboard.press("ArrowLeft");
        await page.waitForTimeout(200); // Wait a bit longer

        // Get and verify cursor info
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBe(1);

        // Verify cursor moved to the first item
        const newActiveItemId = await TestHelpers.getActiveItemId(page);
        expect(newActiveItemId).not.toBeNull();
        expect(newActiveItemId).toBe(itemId1);
    });
});
