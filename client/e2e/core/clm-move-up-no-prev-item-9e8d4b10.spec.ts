import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0004
 *  Title   : Move up
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-0004: Move up", () => {
    test.setTimeout(180000); // 3 minutes
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("When at the top line and there is no previous item, move to the beginning of the same item", async ({ page }) => {
        await page.keyboard.press("Escape");

        // Identify first item (page title or first content item)
        const itemLocator = page.locator(".outliner-item.page-title[data-item-id]");
        let firstItem;
        if ((await itemLocator.count()) === 0) {
            const visibleItems = page.locator(".outliner-item[data-item-id]").filter({ hasText: /.*/ });
            firstItem = visibleItems.first();
        } else {
            firstItem = itemLocator;
        }
        const itemId = await firstItem.getAttribute("data-item-id");
        expect(itemId).toBeTruthy();

        // Set cursor in the middle of the item
        const initialItemText = (await firstItem.locator(".item-text").textContent()) || "";
        await TestHelpers.setCursor(page, itemId!, Math.floor(initialItemText.length / 2));

        // Wait for cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Get current cursor data
        const beforeKeyPressCursorData = await CursorValidator.getCursorData(page);
        const itemIdBefore = beforeKeyPressCursorData.activeItemId;

        // Get offset from active cursor instance
        const activeCursorBefore = beforeKeyPressCursorData.cursorInstances.find((c: any) => c.isActive);
        const offsetBefore = activeCursorBefore ? activeCursorBefore.offset : 0;

        console.log(`Before ArrowUp: itemId=${itemIdBefore}, offset=${offsetBefore}`);

        // Press ArrowUp
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(300);

        // Get cursor data after key press
        const afterKeyPressCursorData = await CursorValidator.getCursorData(page);
        const activeItemIdAfterKeyPress = afterKeyPressCursorData.activeItemId;

        // Get offset from active cursor instance
        const activeCursorAfter = afterKeyPressCursorData.cursorInstances.find((c: any) => c.isActive);
        const offsetAfter = activeCursorAfter ? activeCursorAfter.offset : 0;

        console.log(`After ArrowUp: itemId=${activeItemIdAfterKeyPress}, offset=${offsetAfter}`);

        // Verify still in the same item
        expect(activeItemIdAfterKeyPress).toBe(itemIdBefore);

        // Verify cursor moved to the beginning (offset 0) of the same item
        expect(offsetAfter).toBe(0);

        // Verify item text
        const itemText = await page.locator(`.outliner-item[data-item-id="${activeItemIdAfterKeyPress}"]`).locator(
            ".item-text",
        )
            .textContent();
        expect(itemText).toBeTruthy();
    });
});
