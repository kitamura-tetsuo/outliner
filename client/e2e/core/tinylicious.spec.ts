import {
    expect,
    test,
} from "@playwright/test";

/**
 * @playwright
 * @title Tinyliciousリアル接続テスト
 */

test.describe("Tinyliciousリアル接続テスト", () => {
    // テスト前の準備 - モックを無効化し、実際のTinyliciousサーバーに接続するように設定
    test.beforeEach(async ({ page }) => {
        // 認証のみモック化し、Fluid接続は実際のTinyliciousを使用
        await page.addInitScript(() => {
            // Fluid接続のモックを無効化
            window.mockFluidClient = false;

            // 認証はモックを使用（認証部分のみ）
            window.localStorage.setItem("authenticated", "true");
            window.mockUser = {
                id: "test-user-id",
                name: "Test User",
                email: "test@example.com",
            };
            window.mockFluidToken = {
                token: "mock-jwt-token",
                user: {
                    id: "test-user-id",
                    name: "Test User",
                },
            };

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
            window.localStorage.setItem("VITE_TINYLICIOUS_PORT", "7082");
        });

        await page.goto("/");

        // ページが完全に読み込まれるまで待機
        await page.waitForLoadState("networkidle");
    });

    // 実際のTinylicious接続テスト
    test("実際のTinyliciousサーバーに接続できること", async ({ page }) => {
        console.log("Running real Tinylicious connection test");

        // デバッグパネルを表示して接続状態を確認
        await page.click('button:has-text("Show Debug")');
        await page.waitForTimeout(2000); // 接続が確立するまで少し待つ

        // スクリーンショットを撮影（接続状態確認用）
        await page.screenshot({ path: "test-results/tinylicious-real-connection.png", fullPage: true });

        // 接続状態テキストを取得して確認
        const connectionStateText = await page.locator(".connection-status span").textContent();
        console.log("Connection state text:", connectionStateText);

        // 接続状態が「接続済み」または「同期中」であることを確認
        expect(connectionStateText).toMatch(/接続済み|同期中/);

        // 状態インジケータのクラスも確認
        const hasConnectedClass = await page.locator(".status-indicator").hasClass("connected");
        expect(hasConnectedClass).toBe(true);
    });

    // 接続テストボタンを使用した明示的な接続テスト
    test("接続テストボタンが機能すること", async ({ page }) => {
        // 接続テストボタンを探す
        const connectButton = page.locator('button:has-text("接続テスト")');

        // ボタンが存在することを確認
        await expect(connectButton).toBeVisible();

        // ボタンをクリック
        await connectButton.click();
        await page.waitForTimeout(2000); // アラート表示を待つ

        // JSのalertがトリガーされたことを確認
        const alertMessage = await page.evaluate(() => window._alertMessage);
        expect(alertMessage).toBeTruthy();
        expect(alertMessage).not.toContain("Error");
        expect(alertMessage).toContain("Connection");

        // スクリーンショットを撮影
        await page.screenshot({ path: "test-results/connection-test-result.png", fullPage: true });
    });
});
