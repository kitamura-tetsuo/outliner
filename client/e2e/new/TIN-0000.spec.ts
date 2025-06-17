/** @feature TIN-0000 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("TIN-0000: tinylicious connectivity", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], false);
        await page.goto("/debug");
    });

    test("実際のTinyliciousサーバーに接続できること", async ({ page }) => {
        await page.click('button:has-text("接続テスト実行")');
        await expect(page.locator("#connection-state-text"))
            .toMatch(/接続中|接続済み|同期中/, { timeout: 10000 });
        const connected = await TestHelpers.connectionIndicatorIsConnected(page);
        expect(connected).toBeTruthy();
    });

    test("デバッグ情報が表示されること", async ({ page }) => {
        await page.click('button:has-text("接続テスト実行")');
        await expect(page.locator("details:has-text('環境設定') pre")).toBeVisible({ timeout: 10000 });
        await expect(page.locator("details:has-text('環境設定') pre")).not.toBeEmpty({ timeout: 5000 });
        await expect(page.locator("details:has-text('Fluidクライアント') pre")).toBeVisible({ timeout: 10000 });
        await expect(page.locator("details:has-text('Fluidクライアント') pre")).not.toBeEmpty({ timeout: 5000 });
    });
});
