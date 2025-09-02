/** @feature LNK-0003
 *  Title   : 内部リンクのナビゲーション機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0003: 内部リンクのナビゲーション機能", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });
    test("存在しないページへの内部リンクをクリックした場合の挙動", async ({ page }) => {
        // 存在しないページ名を生成
        const nonExistentPageName = "unknown-page-" + Date.now().toString().slice(-6);

        // 最初のアイテムに存在しないページへの内部リンクを作成
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // 存在しないページへの内部リンクを入力
        await page.keyboard.type(`This is a link to [${nonExistentPageName}]`);

        await page.waitForTimeout(500);

        // フォーカスを外してリンクが表示されるようにする
        await page.locator("body").click({ position: { x: 10, y: 10 } });
        await page.waitForTimeout(1000);

        // 内部リンクが生成されていることを確認
        const linkElement = page.locator(`a.internal-link`).filter({ hasText: nonExistentPageName });
        await expect(linkElement).toBeVisible({ timeout: 5000 });
        // リンクのhref属性を確認
        const linkHref = await linkElement.getAttribute("href");
        console.log(`Non-existent page link href: ${linkHref}`);
        expect(linkHref).toBe(`/${nonExistentPageName}`);

        // リンクが存在しないページを示すクラスを持っていることを確認
        const linkClass = await linkElement.getAttribute("class");
        expect(linkClass).toContain("page-not-exists");

        console.log("Non-existent page link test completed successfully");

        // TODO: 内部リンクのナビゲーション機能が実装されたら、以下のテストを有効化
        //
        await linkElement.click();
        //
        await page.waitForTimeout(1000);
        // // 存在しないページに移動し、新規ページが作成されることを確認
        //
        await expect(page).toHaveURL(new RegExp(nonExistentPageName));
        //
        const pageTitle = page.locator(".page-title-content .item-text");
        //
        await expect(pageTitle).toBeVisible({ timeout: 5000 });
        //
        await expect(pageTitle).toContainText(nonExistentPageName);
    });
});
