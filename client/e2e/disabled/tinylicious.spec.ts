/** @feature TST-0005
 *  Title   : テスト環境の初期化と準備
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";

/**
 * @file tinylicious.spec.ts
 * @description Tinyliciousサーバーへの接続テスト
 * アプリケーションがTinyliciousサーバーと正常に接続できることを確認するためのテストです。
 * 実際の接続状態の検証、接続テストボタンの機能確認など、Fluid Frameworkの
 * 基本的な接続機能をテストします。
 * このテストでは、デバッグページ(/debug)を使用してTinyliciousサーバーへの接続を確認します。
 * @playwright
 * @title Tinyliciousリアル接続テスト
 */

test.describe("Tinyliciousリアル接続テスト", () => {
    // テスト前の準備 - モックを無効化し、実際のTinyliciousサーバーに接続するように設定
    test.beforeEach(async ({ page }, testInfo) => { // エミュレータを使用してTinyliciousに接続
        // テスト開始前に十分な時間を設定

        await page.addInitScript(() => {
            // 接続状態のモックは削除（実際の接続状態を確認するため）
            // モックコンテナが接続済みであることをシミュレートしない

            // アラートをキャプチャしてテストで確認できるようにする
            window.alert = function (message) {
                window._alertMessage = message;
                console.log("Alert:", message);
            };
        });

        // 強制的にテスト用の環境変数を設定
        await page.addInitScript(() => {
            window.localStorage.setItem("VITE_USE_TINYLICIOUS", "true");
            window.localStorage.setItem("VITE_TINYLICIOUS_PORT", "7092");
        });

        // デバッグページにアクセス
        await page.goto("/debug");
    });

    /**
     * @testcase 実際のTinyliciousサーバーに接続できること
     * @description アプリケーションがTinyliciousサーバーに正常に接続できることを確認するテスト
     * @check 接続テスト実行ボタンをクリックして接続を開始する
     * @check 接続状態が「接続済み」または「同期中」のいずれかであることを確認する
     * @check 接続状態インジケータが「connected」クラスを持っていることを確認する
     * @check スクリーンショットを撮影して接続状態を視覚的に記録する
     */
    test("実際のTinyliciousサーバーに接続できること", async ({ page }) => {
        console.log("Running real Tinylicious connection test");

        // 接続テスト実行ボタンをクリック
        await page.click('button:has-text("接続テスト実行")');

        // 接続が確立するまで少し待つ
        await page.waitForTimeout(5000);

        // スクリーンショットを撮影（接続状態確認用）
        await page.screenshot({ path: "test-results/tinylicious-connection.png", fullPage: true });

        // 接続状態テキストを取得して確認
        const connectionStateText = await page.locator("#connection-state-text").textContent();
        console.log("Connection state text:", connectionStateText);

        // 接続状態が「接続済み」または「同期中」であることを確認
        expect(connectionStateText).toMatch(/接続中|接続済み|同期中/);

        // 接続インジケータが「connected」クラスを持っていることを確認
        const hasConnectedClass = await page.evaluate(() => {
            const indicator = document.querySelector(".status-indicator");
            return indicator?.classList.contains("connected");
        });

        expect(hasConnectedClass).toBeTruthy();
    });

    /**
     * @testcase デバッグ情報が表示されること
     * @description デバッグページに必要な情報が表示されることを確認するテスト
     * @check 環境設定情報が表示されていることを確認
     * @check Fluidクライアント情報が表示されていることを確認
     */
    test("デバッグ情報が表示されること", async ({ page }) => {
        // 接続テスト実行ボタンをクリック
        await page.click('button:has-text("接続テスト実行")');

        // 接続が確立するまで少し待つ
        await page.waitForTimeout(5000);

        // 環境設定情報が表示されていることを確認
        const envConfigText = await page.locator("details:has-text('環境設定') pre").textContent();
        expect(envConfigText).toBeTruthy();

        // Fluidクライアント情報が表示されていることを確認
        const fluidClientText = await page.locator("details:has-text('Fluidクライアント') pre").textContent();
        expect(fluidClientText).toBeTruthy();

        // スクリーンショットを撮影
        await page.screenshot({ path: "test-results/debug-info.png", fullPage: true });
    });
});
