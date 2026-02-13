import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-1cef29b1
 *  Title   : Cursor count remains stable after drag
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-1cef29b1: Cursor count remains stable after drag", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["Item A", "Item B", "Item C"]);
    });

    test("Cursor count does not change even after dragging and moving an item", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page, 4, 10000); // Title + 3 items

        // Item 0 is Title. Item 1, 2, 3 are seeded items.
        // We want to drag Item 2 (Item B) to Item 3 (Item C).
        const firstId = await TestHelpers.getItemIdByIndex(page, 1); // Item A
        await TestHelpers.setCursor(page, firstId!); // Set cursor explicitly

        const secondId = await TestHelpers.getItemIdByIndex(page, 2);
        const thirdId = await TestHelpers.getItemIdByIndex(page, 3);

        const cursorCountBefore = await page.evaluate(() => {
            return (window as { editorOverlayStore?: { getCursorInstances: () => any[]; }; }).editorOverlayStore!
                .getCursorInstances().length;
        });

        const secondLocator = page.locator(`.outliner-item[data-item-id="${secondId}"] .item-content`);
        const thirdLocator = page.locator(`.outliner-item[data-item-id="${thirdId}"] .item-content`);
        const secondBox = await secondLocator.boundingBox();
        const thirdBox = await thirdLocator.boundingBox();
        if (secondBox && thirdBox) {
            await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2);
            await page.mouse.down();
            await page.mouse.move(thirdBox.x + thirdBox.width / 2, thirdBox.y + thirdBox.height / 2, { steps: 10 });
            await page.mouse.up();
        }
        await page.waitForTimeout(300);

        const cursorCountAfter = await page.evaluate(() => {
            return (window as { editorOverlayStore?: { getCursorInstances: () => any[]; }; }).editorOverlayStore!
                .getCursorInstances().length;
        });

        expect(cursorCountAfter).toBe(cursorCountBefore);
    });
});
