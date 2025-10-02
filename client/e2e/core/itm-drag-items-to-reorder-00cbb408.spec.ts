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

        // 実際のDragEvent/DataTransferフローを使用してドラッグ操作を実行
        await page.evaluate(({ secondId, thirdId }) => {
            const sourceContent = document.querySelector<HTMLElement>(`[data-item-id="${secondId}"] .item-content`)
                ?? document.querySelector<HTMLElement>(`[data-item-id="${secondId}"]`);
            const targetContent = document.querySelector<HTMLElement>(`[data-item-id="${thirdId}"] .item-content`)
                ?? document.querySelector<HTMLElement>(`[data-item-id="${thirdId}"]`);

            if (!sourceContent || !targetContent) {
                throw new Error(`Source or target content element not found`);
            }

            const dataTransfer = new DataTransfer();
            dataTransfer.setData("text/plain", sourceContent.textContent ?? "");
            dataTransfer.setData("application/x-outliner-item", secondId);

            const sourceRect = sourceContent.getBoundingClientRect();
            const targetRect = targetContent.getBoundingClientRect();
            const centerX = Math.floor(targetRect.left + targetRect.width / 2);
            const bottomY = Math.floor(targetRect.bottom - 1);
            const sourceX = Math.floor(sourceRect.left + sourceRect.width / 2);
            const sourceY = Math.floor(sourceRect.top + sourceRect.height / 2);

            const dragStartEvent = new DragEvent("dragstart", {
                bubbles: true,
                cancelable: true,
                dataTransfer,
                clientX: sourceX,
                clientY: sourceY,
            });

            const dragOverEvent = new DragEvent("dragover", {
                bubbles: true,
                cancelable: true,
                dataTransfer,
                clientX: centerX,
                clientY: bottomY,
            });

            const dropEvent = new DragEvent("drop", {
                bubbles: true,
                cancelable: true,
                dataTransfer,
                clientX: centerX,
                clientY: bottomY,
            });

            const dragEndEvent = new DragEvent("dragend", {
                bubbles: true,
                cancelable: true,
                dataTransfer,
                clientX: centerX,
                clientY: bottomY,
            });

            sourceContent.dispatchEvent(dragStartEvent);
            targetContent.dispatchEvent(dragOverEvent);
            targetContent.dispatchEvent(dropEvent);
            sourceContent.dispatchEvent(dragEndEvent);
        }, { secondId, thirdId });

        // ドラッグによる再配置が完了するのを待つ
        await page.waitForTimeout(2000);

        // 移動後の順序を確認 - Item 2がItem 3の後ろ（index 2）に移動しているはず
        await expect(page.locator(`.outliner-item[data-item-id="${secondId}"]`)).toBeVisible();

        // Item 2のテキストが正しいことを確認
        const movedText = await page.locator(`.outliner-item[data-item-id="${secondId}"] .item-text`).textContent();
        expect(movedText).toBe(secondText);

        // 順序を確認: Item 1, Item 3, Item 2 の順になっているはず
        const items = await page.locator(".outliner-item .item-text").allTextContents();
        expect(items[0]).toBe("Item 1");
        expect(items[1]).toBe("Item 3");
        expect(items[2]).toBe("Item 2");
    });
});
import "../utils/registerAfterEachSnapshot";
