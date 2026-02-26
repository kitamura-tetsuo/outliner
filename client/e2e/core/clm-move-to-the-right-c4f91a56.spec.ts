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

    test("ArrowRight key moves the cursor one character to the right", async ({ page }) => {
        // Get the active item element (Item 1: "Test data")
        // Note: Item 0 is Title. Item 1 is "Test data".
        const itemId = await TestHelpers.getItemIdByIndex(page, 1);
        await TestHelpers.setCursor(page, itemId!);
        // Ensure cursor is fully ready and active before asserting
        await TestHelpers.ensureCursorReady(page);

        // Get and verify initial cursor information
        let cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.activeItemId).not.toBeNull();

        // Move cursor to the left end (Home key)
        await page.keyboard.press("Home");
        await page.waitForTimeout(300);

        // Re-acquire and verify cursor information
        cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.activeItemId).not.toBeNull();

        // Confirm that the cursor is at the left end
        const initialOffset = cursorData.cursorInstances?.[0]?.offset;
        expect(initialOffset).not.toBeUndefined();

        // Press the Right Arrow key to move the cursor one character to the right
        await page.keyboard.press("ArrowRight");

        // Wait for update
        await page.waitForTimeout(300);

        // Get new cursor information
        const updatedCursorData = await CursorValidator.getCursorData(page);
        const newOffset = updatedCursorData.cursorInstances?.[0]?.offset;

        // Confirm that the cursor offset has changed by one character (moved to the right)
        expect(newOffset).toBe(initialOffset + 1);

        // Confirm that the number of cursors remains one
        expect(updatedCursorData.cursorCount).toBe(1);
    });

    test("When at the last character, moves to the first character of the next item", async ({ page }) => {
        // Check the number of items at the start of the test
        const initialItemCount = await page.locator(".outliner-item").count();
        console.log(`Item count at start of test: ${initialItemCount}`);

        // Get the first item ID (Item 1)
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        console.log(`First item ID: ${firstItemId}`);
        expect(firstItemId).not.toBeNull();

        // Confirm that the second item exists (Item 2)
        const secondItemId = await TestHelpers.getItemIdByIndex(page, 2);
        const secondItem = page.locator(`.outliner-item[data-item-id="${secondItemId}"]`);
        await secondItem.waitFor({ state: "visible" });

        // Check the text content of the second item
        await expect(secondItem.locator(".item-text")).toContainText("Second item");

        // Set cursor to the first item
        await TestHelpers.setCursor(page, firstItemId!);

        // Wait until the cursor is visible
        await TestHelpers.waitForCursorVisible(page);

        // Move cursor to the end of the line
        await page.keyboard.press("End");

        // Wait a bit longer to confirm cursor movement - wait for End key processing to complete
        await page.waitForTimeout(300);

        // Get cursor information and confirm it has actually moved to the end
        let cursorData = await CursorValidator.getCursorData(page);
        console.log(`Cursor count after End key movement: ${cursorData.cursorCount}`);
        expect(cursorData.cursorCount).toBe(1);

        const initialItemId = cursorData.activeItemId;
        const initialOffset = cursorData.cursorInstances?.[0]?.offset;
        const initialText = await page.locator(`.outliner-item[data-item-id="${initialItemId}"] .item-text`)
            .textContent();
        console.log(
            `Before move: Item ID=${initialItemId}, Offset=${initialOffset}, Text length=${initialText?.length}`,
        );

        // Confirmation: Is the cursor actually at the end? (Do text length and offset match?)
        expect(initialOffset).toBe(initialText?.length);

        // Press End key again to ensure cursor position is at the end
        await page.keyboard.press("End");
        await page.waitForTimeout(200);

        // Re-confirmation: Offset=${confirmedOffset}, Text length=${initialText?.length}
        cursorData = await CursorValidator.getCursorData(page);
        const confirmedOffset = cursorData.cursorInstances?.[0]?.offset;
        console.log(`Re-confirmation: Offset=${confirmedOffset}, Text length=${initialText?.length}`);
        expect(confirmedOffset).toBe(initialText?.length);

        // Press the Right Arrow key
        await page.keyboard.press("ArrowRight");

        // Rather than waiting for a fixed time, let's check if the cursor position changes
        // Wait up to 1 second for any possible change to occur
        await page.waitForTimeout(300);

        // Check cursor information after the key press
        cursorData = await CursorValidator.getCursorData(page);
        console.log(`Cursor count after ArrowRight: ${cursorData.cursorCount}`);
        expect(cursorData.cursorCount).toBe(1);

        const updatedItemId = cursorData.activeItemId;
        const updatedOffset = cursorData.cursorInstances?.[0]?.offset;
        console.log(`Item ID after move: ${updatedItemId}, Offset: ${updatedOffset}`);

        // Get the ID of the second item (already retrieved)
        console.log(`Second item ID: ${secondItemId}`);

        // The expected behavior is that when pressing ArrowRight at the end of an item,
        // the cursor should move to the next item at the beginning (offset 0)
        // If the functionality is not working as expected, we need to document this
        expect(updatedItemId).toBe(secondItemId);
        expect(updatedOffset).toBe(0);

        // Enter text into the second item and confirm it is entered correctly
        await page.keyboard.type("Test input");

        // Re-check the text content of the second item
        await expect(secondItem.locator(".item-text")).toContainText("Test input");
    });
});
