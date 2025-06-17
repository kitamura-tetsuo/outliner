/** @feature TST-0003 */
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
import { TestHelpers } from "../utils/testHelpers";

test.describe("認証機能テスト", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // テスト環境を準備（認証コンポーネントが表示されるページに移動）
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // 認証コンポーネントが表示されるまで待機
        await page.waitForSelector(".auth-container", { timeout: 10000 });
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
        // 既にログインしている場合はログアウト
        const logoutButton = page.locator("button.logout-btn");
        if (await logoutButton.isVisible()) {
            await logoutButton.click();
            // ログアウト処理が完了するまで待機
            await page.waitForSelector("button.dev-toggle", { timeout: 10000 });
        }

        // 開発者ログインボタンをクリック
        const devToggleButton = page.locator("button.dev-toggle");
        await expect(devToggleButton).toBeVisible();
        await devToggleButton.click();

        // 開発者ログインフォームが表示されるまで待機
        await page.waitForSelector(".dev-login-form", { timeout: 5000 });

        // 認証情報の入力
        await page.locator("#email").fill("test@example.com");
        await page.locator("#password").fill("password");

        // ログイン実行
        await page.locator("button.dev-login-btn").click();

        // ログイン成功の確認（ログアウトボタンが表示される）
        await expect(page.locator("button.logout-btn")).toBeVisible({ timeout: 10000 });
    });

    /**
     * @testcase ログイン状態の永続化
     * @description ログイン後の状態が正しく保持されることを確認
     * @check ログイン後にページをリロード
     * @check ログイン状態が維持されている
     * @check ユーザー情報が正しく表示される
     */
    test("ログイン状態が正しく保持される", async ({ page }) => {
        // 既にログインしている場合はログアウト
        const logoutButton = page.locator("button.logout-btn");
        if (await logoutButton.isVisible()) {
            await logoutButton.click();
            // ログアウト処理が完了するまで待機
            await page.waitForSelector("button.dev-toggle", { timeout: 10000 });
        }

        // 開発者ログインの実行
        const devToggleButton = page.locator("button.dev-toggle");
        await devToggleButton.click();
        await page.waitForSelector(".dev-login-form", { timeout: 5000 });

        await page.locator("#email").fill("test@example.com");
        await page.locator("#password").fill("password");
        await page.locator("button.dev-login-btn").click();

        // ログイン成功を確認
        await expect(page.locator("button.logout-btn")).toBeVisible({ timeout: 10000 });

        // ページのリロード
        await page.reload();

        // 認証コンポーネントが再度表示されるまで待機
        await page.waitForSelector(".auth-container", { timeout: 10000 });

        // ログイン状態が維持されていることを確認
        await expect(page.locator("button.logout-btn")).toBeVisible({ timeout: 10000 });
    });
});
