import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-1cef29b1
 *  Title   : ドラッグ後もカーソル数は変化しない
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-1cef29b1: ドラッグ後もカーソル数は変化しない", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("アイテムをドラッグして移動してもカーソル数が変化しない", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);
        const firstId = await TestHelpers.getItemIdByIndex(page, 0);
        await TestHelpers.setCursor(page, firstId!);
        await TestHelpers.insertText(page, firstId!, "Item A");
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        const secondId = await TestHelpers.getItemIdByIndex(page, 1);
        await TestHelpers.setCursor(page, secondId!);
        await TestHelpers.insertText(page, secondId!, "Item B");
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        const thirdId = await TestHelpers.getItemIdByIndex(page, 2);
        await TestHelpers.setCursor(page, thirdId!);
        await TestHelpers.insertText(page, thirdId!, "Item C");
        await page.waitForTimeout(300);

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
        await page.waitForTimeout(500);

        const cursorCountAfter = await page.evaluate(() => {
            return (window as { editorOverlayStore?: { getCursorInstances: () => any[]; }; }).editorOverlayStore!
                .getCursorInstances().length;
        });

        expect(cursorCountAfter).toBe(cursorCountBefore);
    });
});
