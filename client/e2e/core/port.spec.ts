/** @feature POR-0000 */
import {
    expect,
    test,
} from "@playwright/test";

/**
 * @file port.spec.ts
 * @description テスト環境のポート設定検証テスト
 * PORT 環境変数で指定されたポートで動作していることを確認するためのテストです。
 * このテストはCIや開発環境で適切なポート設定が行われていることを検証します。
 * @playwright
 * @title テスト環境ポート検証
 */

test.describe("テスト環境ポート検証", () => {
    /**
     * @testcase アプリケーションが環境変数で指定したポートで動作すること
     * @description PORT環境変数で指定したポートでアプリケーションが起動しているかを確認するテスト
     * @check baseURLが指定ポートを含むことを確認
     * @check ページアクセス後のURLに指定ポートが含まれていることを確認
     * @check アプリケーションのタイトル「Fluid Outliner App」が表示されることを確認
     * @check スクリーンショットを撮影して視覚的に確認
     */
    test("アプリケーションが設定したポートで動作していること", async ({ page, baseURL }) => {
        const expectedPort = process.env.PORT || "7090";
        // テスト環境の URL を確認
        expect(baseURL).toMatch(new RegExp(expectedPort));

        // ページにアクセス
        await page.goto("/");

        // URLから直接ポートを確認
        const url = page.url();
        expect(url).toMatch(new RegExp(expectedPort));

        // ポート番号をログに出力
        console.log(`テスト実行時のURL: ${url}`);

        // ページが正しく表示されていることを確認
        await expect(page.locator("h1")).toContainText("Fluid Outliner App");

        // スクリーンショットを撮影
        await page.screenshot({ path: "test-results/test-port-confirmation.png" });
    });
});
