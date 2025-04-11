import {
    expect,
    test,
} from "@playwright/test";

/**
 * @file port.spec.ts
 * @description テスト環境のポート設定検証テスト
 * アプリケーションが正しいポート(7080)で動作していることを確認するためのテストです。
 * このテストはCIや開発環境で適切なポート設定が行われていることを検証します。
 * @playwright
 * @title テスト環境ポート検証
 */

test.describe("テスト環境ポート検証", () => {
    /**
     * @testcase アプリケーションがポート7080で動作していること
     * @description テスト環境でアプリケーションが正しいポート(7080)で動作していることを確認するテスト
     * @check baseURLが「http://localhost:7080」であることを確認
     * @check ページアクセス後のURLに「localhost:7080」が含まれていることを確認
     * @check アプリケーションのタイトル「Fluid Outliner App」が表示されることを確認
     * @check スクリーンショットを撮影して視覚的に確認
     */
    test("アプリケーションがポート7080で動作していること", async ({ page, baseURL }) => {
        // テスト環境の URL を確認
        expect(baseURL).toContain(":7080");

        // ページにアクセス
        await page.goto("/");

        // URLから直接ポートを確認
        const url = page.url();
        expect(url).toContain(":7080");

        // ページが正しく表示されていることを確認
        await expect(page.locator("h1")).toContainText("Fluid Outliner App");

        // スクリーンショットを撮影
        await page.screenshot({ path: "test-results/test-port-confirmation.png" });
    });
});
