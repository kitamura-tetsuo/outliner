/** @feature CLM-0101
 *  Title   : アイテム間移動時のカーソル重複と入力分散問題
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { setupTestPage } from "../helpers";

test.describe("カーソル重複問題の検証", () => {
    test.beforeEach(async ({ page }) => {
        // ヘルパー関数を使用してテストページをセットアップ
        await setupTestPage(page);
    });

    test("修正後：アイテム間をクリックで移動してもカーソルが1つだけ存在する", async ({ page }) => {
        // 1. 最初のアイテムを3回クリック
        await page.locator(".item-content").first().click();
        await page.locator(".item-content").first().click();
        await page.locator(".item-content").first().click();

        // 2. 2番目のアイテムをクリック
        await page.locator("div:nth-child(2) > .outliner-item > .item-header > .item-content-container > .item-content").click();

        // 3. テキスト「123」を入力
        await page.keyboard.type("123");

        // 4. カーソルの数を確認（1つだけのはず）
        const cursorCount = await page.evaluate(() => {
            return document.querySelectorAll(".cursor").length;
        });
        console.log(`表示されているカーソルの数: ${cursorCount}`);
        expect(cursorCount).toBe(1); // カーソルが1つだけ存在することを確認

        // 5. 2番目のアイテムのテキスト内容を確認
        const secondItemText = await page.locator("div:nth-child(2) > .outliner-item").locator(".item-text").textContent();
        console.log(`2番目のアイテムのテキスト: ${secondItemText}`);
        expect(secondItemText).toContain("123"); // 2番目のアイテムに「123」が含まれていることを確認

        // 6. 1番目のアイテムのテキスト内容を確認
        const firstItemText = await page.locator(".outliner-item").first().locator(".item-text").textContent();
        console.log(`1番目のアイテムのテキスト: ${firstItemText}`);
        expect(firstItemText).not.toContain("123"); // 1番目のアイテムに「123」が含まれていないことを確認

        // 7. 1番目のアイテムをクリック
        await page.locator(".item-content").first().click();

        // 8. テキスト「456」を入力
        await page.keyboard.type("456");

        // 9. 1番目のアイテムのテキスト内容を確認
        const updatedFirstItemText = await page.locator(".outliner-item").first().locator(".item-text").textContent();
        console.log(`更新後の1番目のアイテムのテキスト: ${updatedFirstItemText}`);
        expect(updatedFirstItemText).toContain("456"); // 1番目のアイテムに「456」が含まれていることを確認

        // 10. 2番目のアイテムのテキスト内容を再確認
        const updatedSecondItemText = await page.locator("div:nth-child(2) > .outliner-item").locator(".item-text").textContent();
        console.log(`更新後の2番目のアイテムのテキスト: ${updatedSecondItemText}`);
        expect(updatedSecondItemText).not.toContain("456"); // 2番目のアイテムに「456」が含まれていないことを確認
        expect(updatedSecondItemText).toContain("123"); // 2番目のアイテムには「123」が含まれていることを確認
    });
});
