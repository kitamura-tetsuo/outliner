/** @feature TST-0005
 *  Title   : テスト環境の初期化と準備
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

/**
 * @file port.spec.ts
 * @description テスト環境のポート設定検証テスト
 * アプリケーションが正しいポート(7080または7090)で動作していることを確認するためのテストです。
 * このテストはCIや開発環境で適切なポート設定が行われていることを検証します。
 * @playwright
 * @title テスト環境ポート検証
 */

test.describe("テスト環境ポート検証", () => {
    /**
     * @testcase アプリケーションがポート7080または7090で動作していること
     * @description テスト環境でアプリケーションが正しいポート(7080または7090)で動作していることを確認するテスト
     * @check baseURLが「http://localhost:7080」または「http://localhost:7090」であることを確認
     * @check ページアクセス後のURLに「localhost:7080」または「localhost:7090」が含まれていることを確認
     * @check アプリケーションのタイトル「Fluid Outliner App」が表示されることを確認
     * @check スクリーンショットを撮影して視覚的に確認
     */
    test("アプリケーションがポート7080または7090で動作していること", async ({ page, baseURL }) => {
        // テスト環境の URL を確認
        expect(baseURL).toMatch(/(7080|7090)/);

        // ページにアクセス
        await page.goto("/");

        // URLから直接ポートを確認
        const url = page.url();
        expect(url).toMatch(/(7080|7090)/);

        // ポート番号をログに出力
        console.log(`テスト実行時のURL: ${url}`);

        // ページが正しく表示されていることを確認
        await expect(page.locator("h1")).toContainText("Fluid Outliner App");

        // スクリーンショットを撮影
        await page.screenshot({ path: "test-results/test-port-confirmation.png" });
    });
});
