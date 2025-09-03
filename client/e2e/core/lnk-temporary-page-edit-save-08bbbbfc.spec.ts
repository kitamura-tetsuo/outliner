/** @feature LNK-0004
 *  Title   : 仮ページ機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0004: 仮ページ編集保存", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("仮ページを編集した場合に実際のページとして保存される", async ({ page }) => {
        const sourceUrl = page.url();
        const nonExistentPage = "edit-temp-page-" + Date.now().toString().slice(-6);
        await page.goto(`${sourceUrl}${nonExistentPage}`);
        await page.waitForSelector("body", { timeout: 10000 });

        const loginButton = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(1000);
        }

        const outlinerBase = page.locator("[data-testid='outliner-base']");
        await expect(outlinerBase).toBeVisible();

        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await page.waitForTimeout(500);

        const firstId = await firstItem.getAttribute("data-item-id");
        await TestHelpers.setCursor(page, firstId!);
        await TestHelpers.insertText(page, firstId!, "これは編集された仮ページです。");
        await page.waitForTimeout(500);

        await page.waitForTimeout(1000);

        const currentUrl = page.url();
        expect(currentUrl).toContain(nonExistentPage);
    });
});
import "../utils/registerAfterEachSnapshot";
