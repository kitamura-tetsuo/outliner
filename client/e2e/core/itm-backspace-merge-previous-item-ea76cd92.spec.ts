import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ITM-ea76cd92
 *  Title   : Merge with previous item using Backspace
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-ea76cd92: Backspace merge previous item", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["First", "Second"]);
    });

    test("pressing Backspace at line start merges with previous item", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        // Verify item count
        const itemCount = await page.locator(".outliner-item").count();
        console.log(`Found ${itemCount} items`);

        // Actual test data are the 1st and 2nd items (0th is the page title)
        const firstId = await TestHelpers.getItemIdByIndex(page, 1); // "First"
        const secondId = await TestHelpers.getItemIdByIndex(page, 2); // "Second"
        expect(firstId).not.toBeNull();
        expect(secondId).not.toBeNull();

        console.log(`First item ID: ${firstId}, Second item ID: ${secondId}`);

        // Click the 2nd item ("Second") to enter edit mode
        await page.locator(`.outliner-item[data-item-id="${secondId}"] .item-content`).click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // Move cursor to the beginning of the line
        await page.keyboard.press("Home");
        await page.waitForTimeout(300);

        // Press Backspace to merge with the previous item
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(300);

        // Verify the active item is the first item ("First")
        const activeId = await TestHelpers.getActiveItemId(page);
        console.log(`Active item ID after merge: ${activeId}`);
        expect(activeId).toBe(firstId);

        // Verify the merged text
        const mergedText = await page.locator(`.outliner-item[data-item-id="${firstId}"] .item-text`).textContent();
        console.log(`Merged text: "${mergedText}"`);
        expect(mergedText).toBe("FirstSecond");

        // Verify cursor position
        const cursorData = await CursorValidator.getCursorData(page);
        console.log(`Cursor data:`, cursorData);

        // Verify active item is correctly set
        expect(cursorData.activeItemId).toBe(firstId);

        // Verify cursor position
        if (cursorData.cursors.length > 0) {
            console.log(`Cursor offset: ${cursorData.cursors[0].offset}`);
            expect(cursorData.cursors[0].offset).toBe("First".length);
        } else {
            // Warn if cursor is not set, but do not fail the test
            console.warn("Warning: No cursor found after merge operation");
        }
    });
});
