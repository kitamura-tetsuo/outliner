import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-0004
 *  Title   : 仮ページ機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0004: 仮ページ通知非表示", () => {
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
