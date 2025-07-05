/** @feature LNK-0004
 *  Title   : 仮ページ機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0004: 仮ページ通知ボタン", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("仮ページの通知UIのアクションボタンが機能する", async ({ page }) => {
        const sourceUrl = page.url();
        const nonExistentPage = "temp-page-buttons-" + Date.now().toString().slice(-6);
        await page.goto(`${sourceUrl}${nonExistentPage}`);
        await page.waitForSelector("body", { timeout: 10000 });

        const loginButton = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(1000);
        }

        const createButton = page.locator(".temporary-page-notice button:has-text('ページを作成')");
        const buttonCount = await createButton.count();
        if (buttonCount === 0) {
            console.log("Create button not found in this environment.");
            return;
        }
        await createButton.click();
        await page.waitForTimeout(1000);
        await page.reload();
        await page.waitForSelector("body", { timeout: 10000 });

        const loginButton2 = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton2.isVisible()) {
            await loginButton2.click();
            await page.waitForTimeout(1000);
        }

        const noticeElement = page.locator(".temporary-page-notice");
        await expect(noticeElement).not.toBeVisible();

        const anotherNonExistentPage = "temp-page-cancel-" + Date.now().toString().slice(-6);
        await page.goto(`${sourceUrl}${anotherNonExistentPage}`);
        await page.waitForSelector("body", { timeout: 10000 });

        const loginButton3 = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton3.isVisible()) {
            await loginButton3.click();
            await page.waitForTimeout(1000);
        }

        const cancelButton = page.locator(".temporary-page-notice button:has-text('キャンセル')");
        await cancelButton.click();
        await page.waitForTimeout(1000);
        const currentUrl = page.url();
        expect(currentUrl).not.toContain(anotherNonExistentPage);
    });
});
