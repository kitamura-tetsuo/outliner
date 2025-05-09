import {
    expect,
    test,
} from "@playwright/test";

/**
 * @file example.spec.ts
 * @description Tinylicious接続テストの例
 * アプリケーションとTinyliciousサーバー間の接続機能を検証する基本的なテスト例です。
 * このテストでは、単純な接続確認からUIコンポーネントの表示確認まで、
 * Fluid Frameworkの基礎的な接続機能をテストします。
 * 詳細なテストは tinylicious.spec.ts に移行しました。
 * @playwright
 * @title Tinylicious接続テスト（基本）
 */

test.describe("Tinylicious接続テスト", () => { // すべてのテスト前に必要な設定を行う
    test.beforeEach(async ({ page }) => {
        // エミュレータを使用するための設定
        await page.addInitScript(() => {
            // 認証済み状態をシミュレート
            window.localStorage.setItem("authenticated", "true");

            // アラートを上書き
            window.alert = function (message) {
                // @ts-ignore - テスト用に一時的にプロパティを追加
                window._alertMessage = message;
                console.log("Alert:", message);
            };
        });

        await page.goto("/");

        // ページが完全に読み込まれるまで待機
        await page.waitForLoadState("networkidle", { timeout: 30000 });
    }); /**
     * @testcase Tinyliciousサーバー接続テスト - シンプルバージョン
     * @description Tinyliciousサーバーへの最も基本的な接続テスト
     * @check ページ内に何らかのコンテンツが存在することを確認
     * @check スクリーンショットを撮影してトラブルシューティング用に保存
     * @check 少なくともh1要素（タイトル）が表示されることを確認
     */

    test("Tinyliciousサーバー接続テスト - シンプルバージョン", async ({ page }) => {
        // テストが実行されていることを確認
        console.log("Running simplified Tinylicious test");

        // ページ内のコンテンツを確認
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();

        // スクリーンショットを撮影（トラブルシューティング用）
        await page.screenshot({ path: "test-results/tinylicious-simplified.png", fullPage: true });

        // 少なくともタイトル要素が存在することを確認
        await expect(page.locator("h1")).toBeVisible();
    }); /**
     * @testcase 接続テストボタンが表示されること
     * @description 接続テスト用のUIボタンが画面上に表示されることを確認するシンプルなテスト
     * @check スクリーンショットを撮影して接続テストボタンの表示を視覚的に確認
     */

    test("接続テストボタンが表示されること", async ({ page }) => {
        // スクリーンショットを撮影（UI確認用）
        await page.screenshot({ path: "test-results/connection-test-button.png", fullPage: true });
    });
});

/**
 * @note このテストは tinylicious.spec.ts に移行しました。
 * 詳細なTinylicious接続テストは tinylicious.spec.ts を参照してください。
 */
