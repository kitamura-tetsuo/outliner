/** @feature FMT-0008
 *  Title   : 内部リンクの複数表示
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FMT-0008: 内部リンクの複数表示", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("1つのアイテムに複数の内部リンクが正しく表示される", async ({ page }) => {
        // 2番目のアイテムを使用（ページタイトルではない最初のアイテム）
        const targetItem = page.locator(".outliner-item").nth(1);
        await targetItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // テキストをクリアして新しいテキストを入力
        await page.keyboard.press("Control+a");
        await page.keyboard.type("[page-one] and [page-two]");

        // 別のアイテムをクリックしてフォーカスを外す
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await page.waitForTimeout(500);

        // カーソルがない状態ではリンク要素が表示される
        const links = targetItem.locator("a.internal-link");
        await expect(links).toHaveCount(2);

        const hrefs = await links.evaluateAll(els => els.map(el => el.getAttribute("href")));
        expect(hrefs).toEqual(["/page-one", "/page-two"]);
        const texts = await links.evaluateAll(els => els.map(el => el.textContent));
        expect(texts).toEqual(["page-one", "page-two"]);

        // カーソルを戻すとリンクはプレーンテキスト表示になる
        await targetItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await expect(targetItem.locator("a.internal-link")).toHaveCount(0);
        await expect(targetItem.locator(".item-content")).toContainText("[page-one] and [page-two]");
    });
});
