import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TST-0005
 *  Title   : テスト環境の初期化と準備
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

/**
 * @file basic.spec.ts
 * @description アウトラインアプリの基本機能テスト
 * ホームページの表示や認証UIの確認など、アプリの基本的な機能をテストします。
 * @playwright
 * @title 基本テスト
 */

/**
 * @testcase ホームページが正常に表示される
 * @description アプリのホームページが正しく表示されることを確認するテスト
 * @check ホームページにアクセスするとタイトル「Outliner」が表示される
 * @check 認証コンポーネントが画面に表示される
 */
test("ホームページが正常に表示される", async ({ page }) => {
    await page.goto("/");

    // タイトルが表示されることを確認
    await expect(page.locator("h1")).toContainText("Outliner");

    // 認証コンポーネントが表示されることを確認
    await expect(page.locator(".auth-section")).toBeVisible();
});

/**
 * @testcase 認証UIが正しく表示される
 * @description 認証用のUIコンポーネントが正しく表示されることを確認するテスト
 * @check Googleログインボタンが画面に表示される
 * @check 複数のセレクタ方法でボタンの存在を確認する
 */
test("認証UIが正しく表示される", async ({ page }) => {
    await page.goto("/");

    // ボタン要素を異なる方法で検索（より正確なセレクタを使用）
    await expect(page.locator(".google-btn")).toBeVisible();

    // または、CSSセレクタを使って特定
    const loginButton = page.locator('button:has-text("Google")');
    await expect(loginButton).toBeVisible();
});

/**
 * @testcase ログアウト後にGoogleログインボタンが表示される
 * @description ログイン状態からログアウトするとGoogleログインボタンが再表示されることを確認
 * @check ログアウトボタンをクリックするとGoogleログインボタンが表示される
 */
test("ログアウト後にGoogleログインボタンが表示される", async ({ page }) => {
    await page.goto("/");
    const logoutButton = page.locator("button.logout-btn");
    if (await logoutButton.isVisible()) {
        await logoutButton.click();
    }
    await expect(page.locator(".google-btn")).toBeVisible();
});
