/** @feature ITM-00cbb408
 *  Title   : ドラッグでアイテムを移動
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-00cbb408: ドラッグでアイテムを移動", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("ドラッグでアイテムを移動できる", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);
        const firstId = await TestHelpers.getItemIdByIndex(page, 0);
        await TestHelpers.setCursor(page, firstId!);
        await TestHelpers.insertText(page, firstId!, "Item 1");
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        const secondId = await TestHelpers.getItemIdByIndex(page, 1);
        await TestHelpers.setCursor(page, secondId!);
        await TestHelpers.insertText(page, secondId!, "Item 2");
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        const thirdId = await TestHelpers.getItemIdByIndex(page, 2);
        await TestHelpers.setCursor(page, thirdId!);
        await TestHelpers.insertText(page, thirdId!, "Item 3");
        await page.waitForTimeout(300);

        const secondText = await page.locator(`.outliner-item[data-item-id="${secondId}"] .item-text`).textContent();

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
        await page.waitForTimeout(500);

        const movedText = await page.locator(".outliner-item").nth(2).locator(".item-text").textContent();
        expect(movedText).toBe(secondText);
    });
});
