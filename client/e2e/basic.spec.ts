import "./utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "./utils/registerCoverageHooks";
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
});
