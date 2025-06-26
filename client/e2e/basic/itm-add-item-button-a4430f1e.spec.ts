/** @feature ITM-0002
 *  Title   : ボタンでアイテム追加
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-0002: Add item via button", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // ブラウザのコンソールログを監視
        page.on("console", msg => {
            if (msg.type() === "error") {
                console.log("Browser Error:", msg.text());
            }
            else if (
                msg.text().includes("FluidClient") || msg.text().includes("UserManager") || msg.text().includes("auth")
            ) {
                console.log("Browser Log:", msg.text());
            }
        });

        // TestHelpersを使用してテスト環境を準備
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // アイテム追加ボタンが表示されるまで待機
        await page.waitForSelector('button:has-text("アイテム追加")', { timeout: 10000 });
    });

    test("clicking add item button appends new item", async ({ page }) => {
        // アイテム追加前のアイテム数を取得
        const itemCountBefore = await page.locator(".outliner-item").count();

        // アイテム追加ボタンをクリック
        await page.click('button:has-text("アイテム追加")');

        // 新しいアイテムが追加されるまで待機
        await page.waitForTimeout(1000);

        // アイテム追加後のアイテム数を取得
        const itemCountAfter = await page.locator(".outliner-item").count();

        // アイテムが追加されたことを確認
        expect(itemCountAfter).toBeGreaterThan(itemCountBefore);
    });
});
