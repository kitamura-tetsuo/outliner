/** @feature LNK-0004
 *  Title   : 仮ページ機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0004: 仮ページ通知非表示", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });
    test("仮ページの通知UIが非表示になっている", async ({ page }) => {
        const consoleMessages: string[] = [];
        page.on("console", msg => {
            consoleMessages.push(`${msg.type()}: ${msg.text()}`);
        });
        const sourceUrl = page.url();

        const nonExistentPage = "temp-page-ui-" + Date.now().toString().slice(-6);

        await page.goto(`${sourceUrl}${nonExistentPage}`);

        await page.waitForSelector("body", { timeout: 10000 });
        const loginButton = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton.isVisible()) {
            await loginButton.click();

            await page.waitForTimeout(1000);
        }
        const outlinerBase = page.locator("[data-testid='outliner-base']");

        await expect(outlinerBase).toBeVisible();

        const noticeElement = page.locator(".temporary-page-notice");

        await expect(noticeElement).not.toBeVisible();
    });
});
