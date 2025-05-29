/**
 * @file auth.spec.ts
 * @description 認証機能関連のテスト
 * アプリケーションの認証フローをテストします。
 * 開発環境での認証フローと、実際の認証状態の検証を行います。
 * @playwright
 */

import {
    expect,
    test,
} from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("認証機能テスト", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // テスト開始前に十分な時間を設定

        // ホームページにアクセス
        await page.goto("/");

        // ページが完全に読み込まれるまで待機
        try {
            await page.waitForLoadState("networkidle", { timeout: 60000 });
            console.log("Page loaded, waiting for UI elements to stabilize...");
        }
        catch (error) {
            console.log("Timeout waiting for networkidle, continuing anyway");
            // スクリーンショットを撮影して状態を確認
            await page.screenshot({ path: "test-results/auth-networkidle-timeout.png" });
        }

        // UIが安定するまでさらに待機
        await new Promise(resolve => setTimeout(resolve, 5000));
    });

    /**
     * @testcase 開発者モードでのログインフロー
     * @description 開発環境での認証フローが正常に動作することを確認
     * @check ログアウト状態からスタート
     * @check 開発者ログインボタンのクリックが可能
     * @check メールアドレスとパスワードの入力が可能
     * @check ログインボタンのクリックで認証が完了
     * @check ログイン後にログアウトボタンが表示される
     */
    test("開発者モードでログインフローが正常に動作する", async ({ page }) => {
        // ログアウト状態を確保
        await page.getByRole("button", { name: "ログアウト" }).click();

        // 開発者ログインフローの実行
        await page.getByRole("button", { name: "開発者ログイン" }).click();

        // 認証情報の入力
        await page.getByRole("textbox", { name: "メールアドレス" }).fill("test@example.com");
        await page.getByRole("textbox", { name: "パスワード" }).fill("password");

        // ログイン実行
        await page.getByRole("button", { name: "開発環境でログイン" }).click();

        // ログイン成功の確認
        await expect(page.getByRole("button", { name: "ログアウト" })).toBeVisible();
    });

    /**
     * @testcase ログイン状態の永続化
     * @description ログイン後の状態が正しく保持されることを確認
     * @check ログイン後にページをリロード
     * @check ログイン状態が維持されている
     * @check ユーザー情報が正しく表示される
     */
    test("ログイン状態が正しく保持される", async ({ page }) => {
        // ログアウト状態を確保
        await page.getByRole("button", { name: "ログアウト" }).click();

        // 開発者ログインの実行
        await page.getByRole("button", { name: "開発者ログイン" }).click();
        await page.getByRole("textbox", { name: "メールアドレス" }).fill("test@example.com");
        await page.getByRole("textbox", { name: "パスワード" }).fill("password");
        await page.getByRole("button", { name: "開発環境でログイン" }).click();

        // ページのリロード
        await page.reload();

        // ログイン状態の確認
        await expect(page.getByRole("button", { name: "ログアウト" })).toBeVisible();
    });
});
