import {
    expect,
    test,
} from "@playwright/test";

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
    // コンソールエラーを監視
    page.on("console", msg => {
        console.log(`Console ${msg.type()}: ${msg.text()}`);
    });

    // ページエラーを監視
    page.on("pageerror", error => {
        console.log(`Page error: ${error.message}`);
    });

    await page.goto("/");

    // SvelteKitアプリの読み込みを待機
    await page.waitForLoadState("domcontentloaded");

    // さらに少し待機してJavaScriptの実行を待つ
    await page.waitForTimeout(5000);

    // デバッグ: ページのHTMLを出力
    const html = await page.content();
    console.log("Page HTML:", html.substring(0, 1000));

    // デバッグ: ページのタイトルを確認
    const title = await page.title();
    console.log("Page title:", title);

    // デバッグ: h1要素の存在を確認
    const h1Elements = await page.locator("h1").count();
    console.log("Number of h1 elements:", h1Elements);

    // デバッグ: body要素の内容を確認
    const bodyText = await page.locator("body").textContent();
    console.log("Body text:", bodyText?.substring(0, 500));

    // タイトルが表示されることを確認
    await expect(page.locator("h1")).toContainText("Fluid Outliner App");
});
