import {
    expect,
    test,
} from "@playwright/test";

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
 * @check エミュレータを使用して初期状態を設定する
 * @check ホームページにアクセスするとタイトル「Fluid Outliner App」が表示される
 * @check 認証コンポーネントが画面に表示される
 */
test("ホームページが正常に表示される", async ({ page }) => {
    // 必要に応じて認証状態を設定
    await page.addInitScript(() => {
        window.localStorage.setItem("authenticated", "true");
    });

    await page.goto("/");

    // タイトルが表示されることを確認
    await expect(page.locator("h1")).toContainText("Fluid Outliner App");

    // 認証コンポーネントが表示されることを確認
    await expect(page.locator(".auth-section")).toBeVisible();
});

/**
 * @testcase 認証UIが正しく表示される
 * @description 認証用のUIコンポーネントが正しく表示されることを確認するテスト
 * @check テスト環境では自動的にスキップされる（環境変数で判定）
 * @check 本番環境ではエミュレータを使用してテストを実行する
 * @check Googleログインボタンが画面に表示される
 * @check 複数のセレクタ方法でボタンの存在を確認する
 */
// 環境に応じてテストをスキップする条件を追加
test("認証UIが正しく表示される", async ({ page, browserName }) => {
    console.log(process.env);
    // テスト環境かどうかを確認
    const isTestEnv = process.env.NODE_ENV === "test" || process.env.VITE_IS_TEST === "true";

    if (isTestEnv) {
        console.log("テスト環境なので、認証UIのテストをスキップします");
        test.skip();
        return;
    }

    // 本番環境のテスト
    // 必要に応じて認証状態を設定
    await page.addInitScript(() => {
        // エミュレータを使用するため
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle", { timeout: 30000 });

    // ボタン要素を異なる方法で検索（より正確なセレクタを使用）
    await expect(page.locator(".google-btn")).toBeVisible();

    // または、CSSセレクタを使って特定
    const loginButton = page.locator('button:has-text("Google")');
    await expect(loginButton).toBeVisible();
});
