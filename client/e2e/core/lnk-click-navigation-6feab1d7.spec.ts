import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
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

    test("内部リンクをクリックして遷移先のページ内容が正しく表示される", async ({ page }) => {
        // テスト用のページ名を生成
        const targetPageName = "target-page-" + Date.now().toString().slice(-6);

        // 内部リンクを含むテストデータを準備
        await TestHelpers.prepareTestEnvironment(page, test.info(), [`This is a link to [${targetPageName}]`]);

        // 内部リンクが生成されていることを確認
        const linkElement = page.locator(`a.internal-link`).filter({ hasText: targetPageName });
        await expect(linkElement).toBeVisible({ timeout: 10000 });

        // 現在は内部リンクのナビゲーション機能が実装されていないため、
        // リンクが正しく生成されていることのみを確認
        const linkHref = await linkElement.getAttribute("href");
        console.log(`Target link href: ${linkHref}`);

        // Get current project name from URL to verify correct link generation
        const currentUrl = page.url();
        const urlParts = new URL(currentUrl).pathname.split("/").filter(Boolean);
        // urlParts[0] is encoded project name
        const projectNameEncoded = urlParts[0];

        expect(linkHref).toBe(`/${projectNameEncoded}/${targetPageName}`);

        console.log("Internal link generation test completed successfully");

        await linkElement.click();
        await expect(page).toHaveURL(new RegExp(targetPageName));
        const pageTitle = page.locator(".page-title-content .item-text");
        await expect(pageTitle).toBeVisible({ timeout: 10000 });
        await expect(pageTitle).toContainText(targetPageName);
    });
});
