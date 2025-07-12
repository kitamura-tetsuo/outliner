/** @feature CLM-0001
 *  Title   : クリックで編集モードに入る
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-0001: クリックで編集モードに入る", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // 現在のURLを確認
        const url = page.url();
        console.log("Current URL:", url);

        // ページ内の要素を確認
        const elements = await page.evaluate(() => {
            return {
                outlinerItems: document.querySelectorAll(".outliner-item").length,
                pageTitle: document.querySelector(".outliner-item.page-title") ? true : false,
                firstItem: document.querySelector(".outliner-item") ? true : false,
            };
        });
        console.log("Page elements:", elements);
    });

    test("非Altクリックで編集モードに入る", async ({ page }) => {
        // ページタイトルを優先的に使用（最初に表示されるアイテム）
        const item = page.locator(".outliner-item.page-title");

        // ページタイトルが見つからない場合は、表示されている最初のアイテムを使用
        if (await item.count() === 0) {
            // テキスト内容で特定できるアイテムを探す
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
            console.log("Clicked first visible item");
        } else {
            await item.locator(".item-content").click({ force: true });
            console.log("Clicked page title item");
        }

        // スクリーンショットを撮影（クリック後）
        await page.screenshot({ path: "client/test-results/CLM-0001-after-click.png" });

        // 隠し textarea がフォーカスされているか確認
        const isFocused = await page.evaluate(() => {
            const active = document.activeElement;
            return active?.classList.contains("global-textarea");
        });
        console.log("Global textarea focused:", isFocused);
        expect(isFocused).toBe(true);

        // カーソルが表示されるまで待機
        const cursorVisible = await TestHelpers.waitForCursorVisible(page, 30000);
        console.log("Cursor visible:", cursorVisible);
        expect(cursorVisible).toBe(true);

        // カーソル情報を取得して検証
        const cursorData = await CursorValidator.getCursorData(page);
        console.log("Cursor data:", cursorData);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.activeItemId).not.toBeNull();
    });
});
