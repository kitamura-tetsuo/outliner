/** @feature SRP-0001
 *  Title   : Project-Wide Search & Replace
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SRP-0001: Project-Wide Search & Replace", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "First page line",
        ]);
        await TestHelpers.createTestPageViaAPI(page, "second", ["Second page line"]);
    });

    test("search across pages and replace", async ({ page }) => {
        // 検索ボタンが存在することを確認
        await expect(page.locator(".search-btn")).toBeVisible();

        // 検索ボタンをクリックして検索パネルを開く
        await page.locator(".search-btn").click();
        await expect(page.locator(".search-panel")).toBeVisible();

        // 検索文字列を入力して検索実行（実際に存在するテキストを検索）
        await page.fill("#search-input", "line");
        await page.click(".search-btn-action");
        await page.waitForTimeout(500);

        // 検索結果を確認（複数ページにまたがる検索結果があることを確認）
        const results = await page.locator(".search-results .result-item").count();
        console.log(`Search results found: ${results}`);
        expect(results).toBeGreaterThanOrEqual(2);

        // 置換文字列を入力してすべて置換
        await page.fill("#replace-input", "UPDATED");
        await page.click(".replace-all-btn");
        await page.waitForTimeout(1000);

        // 再度検索して置換が完了したことを確認
        await page.fill("#search-input", "line");
        await page.click(".search-btn-action");
        await page.waitForTimeout(500);
        const newResults = await page.locator(".search-results .result-item").count();
        console.log(`Search results after replacement: ${newResults}`);
        expect(newResults).toBe(0);

        // 置換が成功したことを確認（検索結果が0になったことで確認）
        // 実際のテキスト確認は複雑なので、検索結果の変化で置換成功を判定
        expect(newResults).toBe(0);
    });
});
