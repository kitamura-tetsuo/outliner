import {
    expect,
    test,
} from "@playwright/test";

/**
 * @playwright
 * @title テスト環境ポート検証
 */

test.describe("テスト環境ポート検証", () => {
    test("アプリケーションがポート7080で動作していること", async ({ page, baseURL }) => {
        // テスト環境の URL を確認
        expect(baseURL).toBe("http://localhost:7080");

        // ページにアクセス
        await page.goto("/");

        // URLから直接ポートを確認
        const url = page.url();
        expect(url).toContain("localhost:7080");

        // ページが正しく表示されていることを確認
        await expect(page.locator("h1")).toContainText("Fluid Outliner App");

        // スクリーンショットを撮影
        await page.screenshot({ path: "test-results/test-port-confirmation.png" });
    });
});
