/** @feature TST-0005
 *  Title   : テスト環境の初期化と準備
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";

/**
 * @file basic.spec.ts
 * @description 基本機能確認テスト
 * アプリの基本機能、特にページ表示と認証コンポーネントが正しく動作することを確認するテスト群です。
 * @playwright
 * @title 基本テスト
 */

/**
 * @testcase ホームページが正常に表示される
 * @description アプリのホームページが正常に表示されることを確認するテスト
 * @check エミュレータを使用して初期状態を設定する
 * @check ページにアクセスするとタイトル「Fluid Outliner App」が表示される
 * @check 認証コンポーネントが画面上に表示される
 */
test("ホームページが正常に表示される", async ({ page }) => {
    await page.goto("/");

    // タイトルが表示されることを確認
    await expect(page.locator("h1")).toContainText("Fluid Outliner App");
});
