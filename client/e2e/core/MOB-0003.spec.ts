// @ts-nocheck
/** @feature MOB-0003
 *  Title   : Mobile Bottom Action Toolbar
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

test.describe("MOB-0003: Mobile action toolbar", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 375, height: 700 });
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // キーボード操作の代わりに直接データを操作
        await page.evaluate(() => {
            const generalStore = (window as any).generalStore;
            const Tree = (window as any).Tree;
            const Items = (window as any).Items;

            if (generalStore && generalStore.currentPage && Tree && Items) {
                const pageItems = generalStore.currentPage.items;
                if (Tree.is(pageItems, Items)) {
                    Tree.runTransaction(pageItems, () => {
                        const item1 = pageItems.addNode("test-user");
                        item1.text = "One";
                        const item2 = pageItems.addNode("test-user");
                        item2.text = "Two";
                    });
                    generalStore.currentPage = generalStore.currentPage;
                }
            }
        });

        // データが反映されるまで待機
        await page.waitForTimeout(1000);
    });
    test("toolbar appears and performs actions", async ({ page }) => {
        // コンソールログを監視
        page.on("console", msg => {
            if (msg.text().includes("MobileActionToolbar:")) {
                console.log("Browser console:", msg.text());
            }
        });

        const toolbar = page.locator("[data-testid='mobile-action-toolbar']");
        await expect(toolbar).toBeVisible();

        // ツールバーのボタンが存在することを確認
        const indentButton = toolbar.locator("button[aria-label='Indent']");
        await expect(indentButton).toBeVisible();
        console.log("Indent button is visible");
        // "Two"アイテムを直接クリックしてテキストエリアをフォーカス
        await page.locator('.item-content:has-text("Two")').click({ force: true });

        // テキストエリアがフォーカスされるまで待機
        await page.waitForSelector("textarea.global-textarea:focus", { timeout: 5000 });

        // "Two"アイテムのIDを取得してアクティブアイテムとして設定
        const twoItemId = await page.evaluate(() => {
            const items = document.querySelectorAll(".outliner-item");
            for (const item of items) {
                const textElement = item.querySelector(".item-text");
                if (textElement && textElement.textContent?.includes("Two")) {
                    return item.getAttribute("data-item-id");
                }
            }
            return null;
        });

        if (twoItemId) {
            await page.evaluate((itemId) => {
                const editorOverlayStore = (window as any).editorOverlayStore;
                if (editorOverlayStore) {
                    editorOverlayStore.setActiveItem(itemId);
                }
            }, twoItemId);
            console.log(`Set active item to: ${twoItemId}`);
        }

        console.log("Textarea is now focused");
        // ページタイトルの子アイテム数を取得
        const rootItemsBefore: any = await TreeValidator.getTreePathData(page, "items.0.items");
        const countBefore = Array.isArray(rootItemsBefore)
            ? rootItemsBefore.length
            : Object.keys(rootItemsBefore || {}).length;
        console.log(`Before indent: countBefore = ${countBefore}`);

        // アクティブアイテムを確認
        const activeItemId = await page.evaluate(() => {
            const editorOverlayStore = (window as any).editorOverlayStore;
            return editorOverlayStore ? editorOverlayStore.activeItemId : null;
        });
        console.log(`Active item ID: ${activeItemId}`);

        await toolbar.locator("button[aria-label='Indent']").click();
        console.log("Indent button clicked");
        await expect.poll(async () => {
            const rootItems: any = await TreeValidator.getTreePathData(page, "items.0.items");
            return Array.isArray(rootItems) ? rootItems.length : Object.keys(rootItems || {}).length;
        }).toBe(countBefore - 1);

        // アウトデント前にインデントされた子アイテム（"Two"）をクリック
        // "Two"のテキストを持つアイテムを直接検索
        await page.locator('.item-content:has-text("Two")').click({ force: true });

        // "Two"アイテムのIDを再取得してアクティブアイテムとして設定
        const twoItemIdForOutdent = await page.evaluate(() => {
            const items = document.querySelectorAll(".outliner-item");
            for (const item of items) {
                const textElement = item.querySelector(".item-text");
                if (textElement && textElement.textContent?.includes("Two")) {
                    return item.getAttribute("data-item-id");
                }
            }
            return null;
        });

        if (twoItemIdForOutdent) {
            await page.evaluate((itemId) => {
                const editorOverlayStore = (window as any).editorOverlayStore;
                if (editorOverlayStore) {
                    editorOverlayStore.setActiveItem(itemId);
                }
            }, twoItemIdForOutdent);
            console.log(`Set active item for outdent to: ${twoItemIdForOutdent}`);
        }

        await page.waitForTimeout(500);
        await toolbar.locator("button[aria-label='Outdent']").click();
        await page.waitForTimeout(500);

        // アウトデント後は元の子アイテム数に戻ることを確認
        await expect.poll(async () => {
            const rootItems: any = await TreeValidator.getTreePathData(page, "items.0.items");
            const actualCount = Array.isArray(rootItems) ? rootItems.length : Object.keys(rootItems || {}).length;
            return actualCount;
        }).toBe(countBefore);

        console.log("✅ Indent/Outdent operations completed successfully");

        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
});
