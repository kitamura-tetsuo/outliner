/** @feature ITM-00cbb408
 *  Title   : ドラッグでアイテムを移動
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-00cbb408: ドラッグでアイテムを移動", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("ドラッグでアイテムを移動できる", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        // 各アイテムのテキストをクリアしてから設定
        const firstId = await TestHelpers.getItemIdByIndex(page, 0);
        await TestHelpers.setCursor(page, firstId!);
        await page.evaluate(async ({ itemId }) => {
            const editorOverlayStore = (window as any).editorOverlayStore;
            const cursorInstances = editorOverlayStore.getCursorInstances();
            const cursor = cursorInstances.find((c: any) => c.itemId === itemId);
            if (cursor) {
                const target = cursor.findTarget();
                if (target) {
                    target.updateText("");
                    cursor.offset = 0;
                }
            }
        }, { itemId: firstId });
        await TestHelpers.insertText(page, firstId!, "Item 1");
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);

        const secondId = await TestHelpers.getItemIdByIndex(page, 1);
        await TestHelpers.setCursor(page, secondId!);
        await page.evaluate(async ({ itemId }) => {
            const editorOverlayStore = (window as any).editorOverlayStore;
            const cursorInstances = editorOverlayStore.getCursorInstances();
            const cursor = cursorInstances.find((c: any) => c.itemId === itemId);
            if (cursor) {
                const target = cursor.findTarget();
                if (target) {
                    target.updateText("");
                    cursor.offset = 0;
                }
            }
        }, { itemId: secondId });
        await TestHelpers.insertText(page, secondId!, "Item 2");
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);

        const thirdId = await TestHelpers.getItemIdByIndex(page, 2);
        await TestHelpers.setCursor(page, thirdId!);
        await page.evaluate(async ({ itemId }) => {
            const editorOverlayStore = (window as any).editorOverlayStore;
            const cursorInstances = editorOverlayStore.getCursorInstances();
            const cursor = cursorInstances.find((c: any) => c.itemId === itemId);
            if (cursor) {
                const target = cursor.findTarget();
                if (target) {
                    target.updateText("");
                    cursor.offset = 0;
                }
            }
        }, { itemId: thirdId });
        await TestHelpers.insertText(page, thirdId!, "Item 3");
        await page.waitForTimeout(500);

        // テキストが正しく設定されているか確認
        await expect(page.locator(`.outliner-item[data-item-id="${firstId}"] .item-text`)).toHaveText("Item 1");
        await expect(page.locator(`.outliner-item[data-item-id="${secondId}"] .item-text`)).toHaveText("Item 2");
        await expect(page.locator(`.outliner-item[data-item-id="${thirdId}"] .item-text`)).toHaveText("Item 3");

        const secondText = await page.locator(`.outliner-item[data-item-id="${secondId}"] .item-text`).textContent();

        // ドラッグ操作: 2番目のアイテムを3番目の位置に移動（HTML5 Drag & Drop APIを使用）
        const secondLocator = page.locator(`.outliner-item[data-item-id="${secondId}"] .item-content`);
        const thirdLocator = page.locator(`.outliner-item[data-item-id="${thirdId}"] .item-content`);

        // ドラッグ&ドロップを実行
        await secondLocator.dragTo(thirdLocator);
        await page.waitForTimeout(500);

        // 移動後のテキストを確認
        const movedText = await page.locator(".outliner-item").nth(2).locator(".item-text").textContent();
        expect(movedText).toBe(secondText);
    });
});
