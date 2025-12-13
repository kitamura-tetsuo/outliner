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

    test("存在しないページへの内部リンクをクリックした場合の挙動", async ({ page }) => {
        const nonExistentPageName = `unknown-page-${Math.random().toString(16).slice(2, 8)}`;

        // `prepareTestEnvironment` now returns the created project name
        await TestHelpers.prepareTestEnvironment(page, test.info(), [`This is a link to [${nonExistentPageName}]`]);

        // 内部リンクが生成されていることを確認
        const linkElement = page.locator(`a.internal-link`).filter({ hasText: nonExistentPageName });
        await expect(linkElement).toBeVisible({ timeout: 10000 });

        // リンクのhref属性を確認
        const linkHref = await linkElement.getAttribute("href");
        console.log(`Non-existent page link href: ${linkHref}`);
        expect(linkHref).toBe(`/${nonExistentPageName}`);

        // リンクが存在しないページを示すクラスを持っていることを確認
        const linkClass = await linkElement.getAttribute("class");
        expect(linkClass).toContain("page-not-exists");
    });
});
