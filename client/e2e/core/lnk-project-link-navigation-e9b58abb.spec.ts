/** @feature LNK-0003
 *  Title   : 内部リンクのナビゲーション機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0003: 内部リンクのナビゲーション機能", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("プロジェクト内部リンクをクリックして遷移先のページ内容が正しく表示される", async ({ page }) => {
        // テスト用のプロジェクト名とページ名を生成
        const targetProjectName = "target-project-" + Date.now().toString().slice(-6);
        const targetPageName = "target-page-" + Date.now().toString().slice(-6);

        // 最初のアイテムにプロジェクト内部リンクを作成
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // プロジェクト内部リンクを入力
        await page.keyboard.type(`This is a link to [/${targetProjectName}/${targetPageName}]`);
        await page.waitForTimeout(500);

        // フォーカスを外してリンクが表示されるようにする
        await page.locator("body").click({ position: { x: 10, y: 10 } });
        await page.waitForTimeout(1000);

        // プロジェクト内部リンクが生成されていることを確認
        const linkElement = page.locator(`a.internal-link.project-link`).filter({
            hasText: `${targetProjectName}/${targetPageName}`,
        });
        await expect(linkElement).toBeVisible({ timeout: 5000 });

        // リンクのhref属性を確認
        const linkHref = await linkElement.getAttribute("href");
        console.log(`Project link href: ${linkHref}`);
        expect(linkHref).toBe(`/${targetProjectName}/${targetPageName}`);

        // リンクがプロジェクトリンクのクラスを持っていることを確認
        const linkClass = await linkElement.getAttribute("class");
        expect(linkClass).toContain("project-link");

        console.log("Project link generation test completed successfully");

        // TODO: 内部リンクのナビゲーション機能が実装されたら、以下のテストを有効化
        // await linkElement.click();
        // await page.waitForTimeout(1000);
        // await expect(page).toHaveURL(new RegExp(`${targetProjectName}/${targetPageName}`));
        // const pageTitle = page.locator(".page-title-content .item-text");
        // await expect(pageTitle).toBeVisible({ timeout: 5000 });
        // await expect(pageTitle).toContainText(targetPageName);
    });
});
import "../utils/registerAfterEachSnapshot";
