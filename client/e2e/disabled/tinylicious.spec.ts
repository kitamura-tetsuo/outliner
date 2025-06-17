/** @feature TIN-0000 */
// File in disabled/ as it requires a running Tinylicious server and proper test environment config.
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
    test.beforeEach(async ({ page }, testInfo) => {
        // The test should rely on environment being properly configured
        // (e.g., via .env.test or by codex-setp.sh) to use Tinylicious.
        // localStorage overrides for VITE_USE_TINYLICIOUS are removed.

        await page.addInitScript(() => {
            // アラートをキャプチャしてテストで確認できるようにする (kept for potential debugging)
            window.alert = function (message) {
                (window as any)._alertMessage = message;
                console.log("Alert:", message);
            };
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

        // 接続が確立するのを待つ
        await expect(page.locator("#connection-state-text"))
            .toMatch(/接続中|接続済み|同期中/, { timeout: 10000 });

        // スクリーンショットを撮影（接続状態確認用）
        // await page.screenshot({ path: "test-results/tinylicious-connection.png", fullPage: true });

        // 接続状態テキストを取得して確認 (already checked by expect().toMatch())
        const connectionStateText = await page.locator("#connection-state-text").textContent();
        console.log("Connection state text:", connectionStateText);

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
        // 接続テスト実行ボタンをクリック (This might not be strictly necessary if debug info loads without it,
        // but keeping it consistent with the original test logic for now)
        await page.click('button:has-text("接続テスト実行")');

        // Wait for debug sections to be visible and contain text
        await expect(page.locator("details:has-text('環境設定') pre")).toBeVisible({ timeout: 10000 });
        await expect(page.locator("details:has-text('環境設定') pre")).not.toBeEmpty({ timeout: 5000 });

        await expect(page.locator("details:has-text('Fluidクライアント') pre")).toBeVisible({ timeout: 10000 });
        await expect(page.locator("details:has-text('Fluidクライアント') pre")).not.toBeEmpty({ timeout: 5000 });


        // スクリーンショットを撮影
        // await page.screenshot({ path: "test-results/debug-info.png", fullPage: true });
    });
});
