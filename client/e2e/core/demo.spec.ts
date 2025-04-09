import {
    expect,
    test,
} from "@playwright/test";

/**
 * @file demo.spec.ts
 * @description デモンストレーション用の簡易テスト
 * アプリの基本的な動作確認のためのデモテストを含んでいます。
 * 主に開発者がE2Eテストフレームワークの動作確認に使用します。
 */

/**
 * @testcase home page has expected h1
 * @description ホームページにh1要素が表示されることを確認するシンプルなテスト
 * @check ページにアクセスすると、h1要素が画面上に表示される
 */
test("home page has expected h1", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
});
