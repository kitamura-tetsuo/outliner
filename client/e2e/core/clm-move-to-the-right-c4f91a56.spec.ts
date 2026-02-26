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
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["Test data", "Second item"]);
        await TestHelpers.waitForOutlinerItems(page, 3, 10000); // Title + 2 seeded items
    });

    test("ArrowRight key moves cursor one character to the right", async ({ page }) => {
        // Get active item element (Item 1: "Test data")
        // Note: Item 0 is Title. Item 1 is "Test data".
        const itemId = await TestHelpers.getItemIdByIndex(page, 1);
        await TestHelpers.setCursor(page, itemId!);
        // Ensure cursor is fully ready and active before asserting
        await TestHelpers.ensureCursorReady(page);

        // Get initial cursor information and verify
        let cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.activeItemId).not.toBeNull();

        // Move cursor to the beginning (Home key)
        await page.keyboard.press("Home");

        // Verify cursor moved to start
        await expect.poll(async () => {
            const data = await CursorValidator.getCursorData(page);
            return data.cursorInstances?.[0]?.offset;
        }, { timeout: 5000 }).toBe(0);

        // Re-acquire cursor information and verify
        cursorData = await CursorValidator.getCursorData(page);
        const initialOffset = cursorData.cursorInstances?.[0]?.offset;
        expect(initialOffset).toBe(0);

        // Press Right Arrow key to move cursor one character to the right
        await page.keyboard.press("ArrowRight");

        // Wait for cursor offset to update
        await expect.poll(async () => {
            const data = await CursorValidator.getCursorData(page);
            return data.cursorInstances?.[0]?.offset;
        }, { timeout: 5000 }).toBe(initialOffset! + 1);

        // Get new cursor information
        const updatedCursorData = await CursorValidator.getCursorData(page);

        // Confirm cursor count remains 1
        expect(updatedCursorData.cursorCount).toBe(1);
    });

    test("When at the very last character, move to the first character of the next item", async ({ page }) => {
        // Confirm item count at start of test
        const initialItemCount = await page.locator(".outliner-item").count();
        console.log(`Item count at start of test: ${initialItemCount}`);

        // Get first item ID (Item 1)
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        console.log(`First item ID: ${firstItemId}`);
        expect(firstItemId).not.toBeNull();

        // Confirm second item exists (Item 2)
        const secondItemId = await TestHelpers.getItemIdByIndex(page, 2);
        const secondItem = page.locator(`.outliner-item[data-item-id="${secondItemId}"]`);
        await secondItem.waitFor({ state: "visible" });

        // Confirm text content of second item
        await expect(secondItem.locator(".item-text")).toContainText("Second item");

        // Set cursor to first item
        await TestHelpers.setCursor(page, firstItemId!);

        // Wait until cursor is visible
        await TestHelpers.waitForCursorVisible(page);

        // Move cursor to end of line
        await page.keyboard.press("End");

        // Wait for cursor to reach the end
        const initialText = await page.locator(`.outliner-item[data-item-id="${firstItemId}"] .item-text`).textContent();
        const textLength = initialText?.length ?? 0;

        await expect.poll(async () => {
            const data = await CursorValidator.getCursorData(page);
            return data.cursorInstances?.[0]?.offset;
        }, { timeout: 5000 }).toBe(textLength);

        // Get cursor information and confirm it actually moved to the end
        let cursorData = await CursorValidator.getCursorData(page);
        console.log(`Cursor count after End key: ${cursorData.cursorCount}`);
        expect(cursorData.cursorCount).toBe(1);

        const initialItemId = cursorData.activeItemId;
        const initialOffset = cursorData.cursorInstances?.[0]?.offset;

        console.log(
            `Before move: ItemID=${initialItemId}, Offset=${initialOffset}, Text Length=${textLength}`,
        );

        // Confirm: Is cursor actually at the end?
        expect(initialOffset).toBe(textLength);

        // Press Right Arrow key
        await page.keyboard.press("ArrowRight");

        // Wait for cursor to move to the next item
        await expect.poll(async () => {
            const data = await CursorValidator.getCursorData(page);
            return {
                itemId: data.activeItemId,
                offset: data.cursorInstances?.[0]?.offset
            };
        }, { timeout: 5000 }).toEqual({
            itemId: secondItemId,
            offset: 0
        });

        // Check cursor information after the key press
        cursorData = await CursorValidator.getCursorData(page);
        console.log(`Cursor count after ArrowRight: ${cursorData.cursorCount}`);
        expect(cursorData.cursorCount).toBe(1);

        const updatedItemId = cursorData.activeItemId;
        const updatedOffset = cursorData.cursorInstances?.[0]?.offset;
        console.log(`Item ID after move: ${updatedItemId}, Offset: ${updatedOffset}`);

        // Get ID of second item (already retrieved)
        console.log(`Second item ID: ${secondItemId}`);

        // The expected behavior is that when pressing ArrowRight at the end of an item,
        // the cursor should move to the next item at the beginning (offset 0)
        expect(updatedItemId).toBe(secondItemId);
        expect(updatedOffset).toBe(0);

        // Enter text into second item and confirm it is entered correctly
        await page.keyboard.type("Test input");

        // Re-confirm text content of second item
        await expect(secondItem.locator(".item-text")).toContainText("Test input");
    });
});
