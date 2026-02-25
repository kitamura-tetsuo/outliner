import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0003
 *  Title   : Move to the right
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-0003: Move to the right", () => {
    test.setTimeout(180000); // 3 minutes
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["Test data", "Second item"]);
        await TestHelpers.waitForOutlinerItems(page, 3, 15000); // Title + 2 seeded items
    });

    test("ArrowRight key moves cursor one character to the right", async ({ page }) => {
        // Get active item element (Item 1: "Test data")
        // Note: Item 0 is Title. Item 1 is "Test data".
        const itemId = await TestHelpers.getItemIdByIndex(page, 1);
        await TestHelpers.setCursor(page, itemId!);
        // Ensure cursor is fully ready and active before asserting
        await TestHelpers.ensureCursorReady(page);

        // Get and verify initial cursor data
        let cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.activeItemId).not.toBeNull();

        // Move cursor to the beginning (Home key)
        await page.keyboard.press("Home");
        await page.waitForTimeout(300);

        // Re-verify cursor data
        cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.activeItemId).not.toBeNull();

        // Verify cursor is at the beginning
        const initialOffset = cursorData.cursorInstances?.[0]?.offset;
        expect(initialOffset).not.toBeUndefined();

        // Press ArrowRight to move cursor one character to the right
        await page.keyboard.press("ArrowRight");

        // Wait for update
        await page.waitForTimeout(300);

        // Get new cursor data
        const updatedCursorData = await CursorValidator.getCursorData(page);
        const newOffset = updatedCursorData.cursorInstances?.[0]?.offset;

        // Verify cursor offset changed by one character (moved right)
        expect(newOffset).toBe(initialOffset + 1);

        // Verify cursor count remains 1
        expect(updatedCursorData.cursorCount).toBe(1);
    });

    test("When at the end of an item, moves to the beginning of the next item", async ({ page }) => {
        // Verify item count at start of test
        const initialItemCount = await page.locator(".outliner-item").count();
        console.log(`Initial item count: ${initialItemCount}`);

        // Get first item ID (Item 1)
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        console.log(`First item ID: ${firstItemId}`);
        expect(firstItemId).not.toBeNull();

        // Verify second item exists (Item 2)
        const secondItemId = await TestHelpers.getItemIdByIndex(page, 2);
        const secondItem = page.locator(`.outliner-item[data-item-id="${secondItemId}"]`);
        await secondItem.waitFor({ state: "visible" });

        // Verify text content of second item
        await expect(secondItem.locator(".item-text")).toContainText("Second item");

        // Set cursor to the first item
        await TestHelpers.setCursor(page, firstItemId!);

        // Wait for cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Move cursor to the end of the line
        await page.keyboard.press("End");

        // Wait a bit to ensure End key processing completes
        await page.waitForTimeout(300);

        // Verify cursor moved to the end
        let cursorData = await CursorValidator.getCursorData(page);
        console.log(`Cursor count after End key: ${cursorData.cursorCount}`);
        expect(cursorData.cursorCount).toBe(1);

        const initialItemId = cursorData.activeItemId;
        const initialOffset = cursorData.cursorInstances?.[0]?.offset;
        const initialText = await page.locator(`.outliner-item[data-item-id="${initialItemId}"] .item-text`)
            .textContent();
        console.log(
            `Before move: itemId=${initialItemId}, offset=${initialOffset}, textLength=${initialText?.length}`,
        );

        // Verify cursor is actually at the end (offset matches text length)
        expect(initialOffset).toBe(initialText?.length);

        // Press End key again to ensure cursor position is definitely at the end
        await page.keyboard.press("End");
        await page.waitForTimeout(200);

        // Re-verify
        cursorData = await CursorValidator.getCursorData(page);
        const confirmedOffset = cursorData.cursorInstances?.[0]?.offset;
        console.log(`Re-verify: offset=${confirmedOffset}, textLength=${initialText?.length}`);
        expect(confirmedOffset).toBe(initialText?.length);

        // Press ArrowRight
        await page.keyboard.press("ArrowRight");

        // Wait for possible cursor position change
        await page.waitForTimeout(300);

        // Check cursor information after key press
        cursorData = await CursorValidator.getCursorData(page);
        console.log(`Cursor count after ArrowRight: ${cursorData.cursorCount}`);
        expect(cursorData.cursorCount).toBe(1);

        const updatedItemId = cursorData.activeItemId;
        const updatedOffset = cursorData.cursorInstances?.[0]?.offset;
        console.log(`After move: itemId=${updatedItemId}, offset=${updatedOffset}`);

        // Get second item ID (already retrieved)
        console.log(`Second item ID: ${secondItemId}`);

        // The expected behavior is that when pressing ArrowRight at the end of an item,
        // the cursor should move to the beginning (offset 0) of the next item
        expect(updatedItemId).toBe(secondItemId);
        expect(updatedOffset).toBe(0);

        // Verify text input in the second item
        await page.keyboard.type("Test input");

        // Verify text content of the second item again
        await expect(secondItem.locator(".item-text")).toContainText("Test input");
    });
});
