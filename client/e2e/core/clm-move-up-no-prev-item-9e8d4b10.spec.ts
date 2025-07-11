/** @feature CLM-0004
 *  Title   : Move up
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-0004: Move up", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("一番上の行にある時で、一つ前のアイテムがない時は、同じアイテムの先頭へ移動する", async ({ page }) => {
        await page.keyboard.press("Escape");
        const item = page.locator(".outliner-item.page-title");
        if (await item.count() === 0) {
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }
        await TestHelpers.waitForCursorVisible(page);
        const cursor = page.locator(".editor-overlay .cursor.active").first();
        const itemId = await cursor.getAttribute("data-item-id");
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(300);
        const afterKeyPressCursorData = await CursorValidator.getCursorData(page);
        const activeItemIdAfterKeyPress = afterKeyPressCursorData.activeItemId;
        expect(activeItemIdAfterKeyPress).toBe(itemId);
        const itemText = await page.locator(`.outliner-item[data-item-id="${itemId}"]`).locator(".item-text")
            .textContent();
        expect(itemText).toContain("これはページタイトルまたは最初のアイテムです");
    });
});
