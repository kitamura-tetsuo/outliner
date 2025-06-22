/** @feature FMT-0008
 *  Title   : 内部リンクの複数表示
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FMT-0008: 内部リンクの複数表示", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("1つのアイテムに複数の内部リンクが正しく表示される", async ({ page }) => {
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // 入力して次のアイテムに移動
        await page.keyboard.type("[page-one] and [page-two]");
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);

        // カーソルがない状態ではリンク要素が表示される
        const links = firstItem.locator("a.internal-link");
        const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute("href")));
        expect(hrefs).toEqual(["/page-one", "/page-two"]);
        const texts = await links.evaluateAll((els) => els.map((el) => el.textContent));
        expect(texts).toEqual(["page-one", "page-two"]);

        // カーソルを戻すとリンクはプレーンテキスト表示になる
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await expect(firstItem.locator("a.internal-link")).toHaveCount(0);
        await expect(firstItem.locator(".item-content")).toHaveText("[page-one] and [page-two]");
    });
});
