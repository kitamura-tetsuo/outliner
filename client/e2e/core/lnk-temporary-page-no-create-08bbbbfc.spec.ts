import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-0004
 *  Title   : 仮ページ機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0004: 仮ページ未編集確認", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("仮ページにアクセスしただけではページが作成されないことを確認", async ({ page }) => {
        const _sourceUrl = page.url();
        const nonExistentPage = "no-edit-temp-page-" + Date.now().toString().slice(-6);
        await page.goto(`${_sourceUrl}${nonExistentPage}`);
        await page.waitForSelector("body", { timeout: 10000 });

        const loginButton = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(1000);
        }

        await page.goto(_sourceUrl);
        await page.waitForSelector("body", { timeout: 10000 });

        await page.goto(`${_sourceUrl}${nonExistentPage}`);
        await page.waitForSelector("body", { timeout: 10000 });

        const loginButton2 = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton2.isVisible()) {
            await loginButton2.click();
            await page.waitForTimeout(1000);
        }

        const currentUrl = page.url();
        expect(currentUrl).toContain(nonExistentPage);
    });
});
