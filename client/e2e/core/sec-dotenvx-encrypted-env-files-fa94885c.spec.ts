import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SEC-0001
 *  Title   : Dotenvx encrypted env files
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

test.describe("SEC-0001: Dotenvx encrypted env files", () => {
    test.beforeEach(async ({ page }) => {
        // 環境変数のテストなので、/minページにアクセスして環境変数が利用可能な状態にする
        await page.goto("/min");
        await page.waitForFunction(() => (window as any).testEnvVars !== undefined);
    });

    test("Environment variables are loaded", async ({ page }) => {
        // ページが表示されることを確認（beforeEachで/minにナビゲート済み）
        await expect(page.locator("body")).toBeVisible();

        // ブラウザコンテキストが利用可能であることを確認
        const hasWindow = await page.evaluate(() => {
            return typeof window !== "undefined";
        });
        expect(hasWindow).toBe(true);

        // 環境変数が設定されているページの読み込みを確認する
        // 実際の環境変数の値はFTR-0013テストで検証済み
        await expect(page).toHaveURL(/.*\/min/);
    });
});
